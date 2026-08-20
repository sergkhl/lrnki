#!/usr/bin/env python3
"""Reclaim developer-toolchain disk space on a macOS lrnki host, interactively.

Every run is a negotiation — which of a dozen targets do I want *this* time — so the interface is a
checkbox list rather than a flag per target. Nothing is removed until you confirm.

The reason this exists rather than a documented `rm -rf` is the simulator half. Xcode leaves whole
runtimes behind that its own tooling cannot collect: `xcrun simctl runtime delete` only acts on
runtimes registered in CoreSimulator's images.plist, which lists only cryptex disk-image runtimes
(Xcode 16.1+). A runtime installed under the older scheme is absent from that plist, so its download
sits in AssetsV2 marked `NeverCollected` and nothing ever reclaims it — many GB, invisible to
`simctl runtime` and to Storage Management alike.

So this tool DERIVES what is dead instead of naming it. The per-machine paths change with every
Xcode update, and a hardcoded UUID is a stale `rm -rf` waiting to delete the wrong runtime:

    `simctl list runtimes -j` reports bundlePath + buildversion for BOTH runtime styles (unlike
    `simctl runtime list`), `simctl list devices -j` gives the device count per runtime, and the
    asset's MobileAssetProperties.Build joins the AssetsV2 copy back to its runtime. Zero devices
    means dead. Everything else goes in a keep-set that is built before anything is removed.

What is NOT reclaimable is the tree under CoreSimulator/Volumes: those are sealed read-only APFS
volumes mounted from the asset's DMG, so measuring there counts decompressed contents that occupy no
bytes of their own and `rm` cannot touch them at all. The reclaim is the backing .asset, and it only
returns space once the image chain over it is detached — the DMG is held open while attached. Hence:
detach depth-first, then remove the asset. And on a SIP-enabled machine that final removal fails,
because all of AssetsV2 carries the `restricted` flag and the entitled writer is `simdiskimaged`.
Such targets are shown as blocked rather than sold as a reclaim they cannot deliver.

Some targets are correct to delete but expensive to rebuild, so they start unchecked. Two are never
touched at all: the Android AVD, whose e2e provisioning is documented as already paid for once in
apps/learner-app/e2e-native/README.md, and Docker — on a host running several stacks its images are
all active, so a prune trades full rebuilds for a few hundred MB, and the oversized Docker.raw is
sparse-file slack, which is a compaction concern. Both are reported so the numbers stay visible.

Standard library only: no install step, and nothing enters the workspace lockfile.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import plistlib
import shutil
import stat
import subprocess
import sys
import textwrap
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable, Iterable, Sequence

HOME = Path.home()
DATA_VOLUME = "/System/Volumes/Data"

SIM_VOLUMES_ROOT = Path("/Library/Developer/CoreSimulator/Volumes")
SIM_ASSETS_ROOT = Path("/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime")
SIM_DEVICES_ROOT = HOME / "Library/Developer/CoreSimulator/Devices"
DERIVED_DATA = HOME / "Library/Developer/Xcode/DerivedData"
DEVICE_SUPPORT = HOME / "Library/Developer/Xcode/iOS DeviceSupport"

SELECTABLE = "selectable"
BLOCKED = "blocked"
REPORT_ONLY = "report_only"

GROUP_SAFE = "restored by a lockfile or a re-download"
GROUP_COSTLY = "correct to remove, but real rebuild time"
GROUP_BLOCKED = "cannot be removed from here"
GROUP_REPORT = "reported, never modified"

GROUP_ORDER = [GROUP_SAFE, GROUP_COSTLY, GROUP_BLOCKED, GROUP_REPORT]


class ProbeError(RuntimeError):
    """A required probe failed. Distinct from a probe that legitimately found nothing."""


# ---------------------------------------------------------------------------------------------
# Measurement
#
# Sizes are per-path, never per-filesystem. Sampling free space around an operation looks obvious
# and is wrong on a working machine: anything else writing or freeing moves it while the tool runs,
# in either direction and by GB. A run that deleted nothing has been observed losing 48 MiB to
# background writes and, on another occasion, gaining 16 GiB because an emulator wipe was running in
# a second terminal. Free space is therefore reported as a fact about the disk, with any movement
# named as drift rather than claimed as this run's result.
# ---------------------------------------------------------------------------------------------


def free_kb() -> int:
    return shutil.disk_usage(DATA_VOLUME).free // 1024


def human(kb: float) -> str:
    sign = "-" if kb < 0 else ""
    kb = abs(kb)
    for unit in ("KiB", "MiB", "GiB", "TiB"):
        if kb < 1024 or unit == "TiB":
            return f"{sign}{kb:.1f} {unit}"
        kb /= 1024
    return f"{sign}{kb:.1f} TiB"


def size_kb(path: Path | str) -> int:
    """Disk usage of `path` in KiB, or 0 when it does not exist.

    `du` rather than an os.walk: it is C, and these trees run to tens of GB. A mountpoint returns 0
    deliberately — measuring through a mount counts the decompressed contents of a disk image, which
    is how a mounted 8 GiB DMG once got reported as a reclaimable 17 GiB of files.
    """
    path = Path(path)
    try:
        if not path.exists() or os.path.ismount(path):
            return 0
    except OSError:
        return 0
    try:
        out = subprocess.run(
            ["du", "-sk", str(path)], capture_output=True, text=True, timeout=900
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    first = out.split("\n", 1)[0].split("\t", 1)[0].strip()
    return int(first) if first.isdigit() else 0


def is_sip_restricted(path: Path) -> bool:
    try:
        return bool(os.stat(path).st_flags & stat.SF_RESTRICTED)
    except (OSError, AttributeError):
        return False


def run(*argv: str, check: bool = False, timeout: int = 900) -> subprocess.CompletedProcess:
    return subprocess.run(
        argv, capture_output=True, text=True, check=check, timeout=timeout
    )


# ---------------------------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------------------------


@dataclass
class Target:
    key: str
    group: str
    label: str
    state: str = SELECTABLE
    detail: str = ""
    size_kb: int = 0
    #: KiB this target frees if run. Equals size_kb for a plain delete; differs where an operation
    #: resets rather than removes (simulator erase), or where a tool reports its own estimate.
    projected_kb: int = 0
    #: None when the reclaim genuinely cannot be known in advance, which renders as "unknown"
    #: rather than a zero indistinguishable from "nothing to do".
    projectable: bool = True
    needs_sudo: bool = False
    selected: bool = False
    paths: list[Path] = field(default_factory=list)
    action: Callable[[bool], int] | None = None

    def as_json(self) -> dict:
        return {
            "key": self.key,
            "group": self.group,
            "label": self.label,
            "state": self.state,
            "detail": self.detail,
            "size_kb": self.size_kb,
            "projected_kb": self.projected_kb if self.projectable else None,
            "needs_sudo": self.needs_sudo,
            "default_selected": self.selected,
            "paths": [str(p) for p in self.paths],
        }


def remove_tree(target: Path, expected_root: Path, sudo: bool) -> None:
    """Delete `target`, refusing anything that is not genuinely inside `expected_root`.

    The single choke point for destruction. A derivation bug aborts the run here rather than
    widening an `rm -rf` into whatever a short or empty string resolved to.
    """
    target = Path(target)
    root = Path(expected_root)
    if not target.is_absolute() or root not in target.parents:
        raise RuntimeError(f"refusing to remove {target!s}: not under {root!s}")
    if os.path.ismount(target):
        raise RuntimeError(f"refusing to remove {target!s}: it is a mountpoint")
    if not (target.exists() or target.is_symlink()):
        return
    if sudo:
        proc = run("sudo", "rm", "-rf", str(target))
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or "permission denied").strip())
    elif target.is_dir() and not target.is_symlink():
        shutil.rmtree(target, ignore_errors=False)
    else:
        # Not every entry in a cache directory is a directory. shutil.rmtree raises ENOTDIR on a
        # plain file, and a lone .DS_Store — which sorts ahead of every letter — was enough to
        # abort the whole DerivedData target before it removed anything.
        target.unlink()


def delete_paths(paths: Sequence[Path], root: Path, sudo: bool = False) -> Callable[[bool], int]:
    def action(dry_run: bool) -> int:
        freed = 0
        for path in paths:
            before = size_kb(path)
            if not dry_run:
                PROGRESS.note(f"removing {path.name}")
                remove_tree(path, root, sudo)
            freed += before
        return freed

    return action


# ---------------------------------------------------------------------------------------------
# Discovery — simulators
# ---------------------------------------------------------------------------------------------


def simctl_json(*args: str) -> dict:
    proc = run("xcrun", "simctl", *args, "-j")
    if proc.returncode != 0:
        raise ProbeError(f"`xcrun simctl {' '.join(args)}` failed: {proc.stderr.strip()}")
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"`xcrun simctl {' '.join(args)}` returned no JSON: {exc}") from exc


def probe_simulators() -> tuple[dict, dict]:
    """Probe once, validate once.

    "No orphans found" and "the probe returned nothing" are indistinguishable downstream, and the
    second silently converts a broken query into a clean bill of health. Validating inside the first
    consumer is too late: an earlier consumer of the same broken response dies on a type error and
    the caller sees that instead of the real diagnosis.
    """
    runtimes = simctl_json("list", "runtimes")
    devices = simctl_json("list", "devices")
    n_runtimes = len(runtimes.get("runtimes") or [])
    n_groups = len(devices.get("devices") or {})
    if n_runtimes < 1 or n_groups < 1:
        raise ProbeError(
            f"simctl reported {n_runtimes} runtimes and {n_groups} device groups. That is a failed "
            "probe, not an empty result — check `xcode-select -p` and that "
            "`xcrun simctl list runtimes -j` returns JSON."
        )
    return runtimes, devices


def unavailable_devices(devices: dict) -> list[dict]:
    """Devices stranded on a runtime that is no longer installed.

    Availability is read off the device, never off the group key. `simctl list devices` prints a
    header reading "-- Unavailable: com.apple…iOS-26-4 --", but that word exists only in the human
    output: the JSON key is the bare runtime identifier, so matching /unavailable/ on it returns
    zero on every machine and the row reads "none" while GBs of stranded devices sit there.
    """
    return [
        device
        for group in (devices.get("devices") or {}).values()
        for device in group
        if device.get("isAvailable") is False
    ]


def volume_root_of(bundle_path: str) -> Path | None:
    """The `/Library/Developer/CoreSimulator/Volumes/<name>` prefix a runtime bundle hangs off."""
    parts = Path(bundle_path).parts
    if len(parts) < 6:
        return None
    root = Path(*parts[:6])
    return root if SIM_VOLUMES_ROOT in root.parents or root.parent == SIM_VOLUMES_ROOT else None


def asset_build(asset: Path) -> str | None:
    try:
        with (asset / "Info.plist").open("rb") as handle:
            plist = plistlib.load(handle)
    except (OSError, plistlib.InvalidFileException):
        return None
    return (plist.get("MobileAssetProperties") or {}).get("Build")


def attached_images() -> list[tuple[str, str]]:
    """(mount-point, backing image path) for every attached disk image."""
    proc = run("hdiutil", "info", "-plist")
    if proc.returncode != 0:
        return []
    try:
        info = plistlib.loads(proc.stdout.encode())
    except plistlib.InvalidFileException:
        return []
    pairs = []
    for image in info.get("images") or []:
        path = image.get("image-path")
        for entity in image.get("system-entities") or []:
            mount = entity.get("mount-point")
            if mount and path:
                pairs.append((mount, path))
    return pairs


def detach_chain_for(asset: Path) -> list[str]:
    """Mountpoints backed by `asset`, transitively, in the order they must be detached.

    The asset's DMG mounts somewhere, and that mount contains a further DMG that mounts again. The
    fixpoint below discovers an outer mount before the inner one whose image lives inside it, so the
    list is reversed: detaching the outer first fails while the inner still holds it open. Path
    depth is NOT the ordering — here the inner mount has the shorter path of the two.
    """
    images = attached_images()
    roots = [str(asset)]
    for _ in range(4):
        grew = False
        for mount, image in images:
            if mount in roots:
                continue
            if any(image.startswith(root.rstrip("/") + "/") for root in roots):
                roots.append(mount)
                grew = True
        if not grew:
            break
    return list(reversed(roots[1:]))


def discover_simulators(targets: list[Target]) -> None:
    runtimes, devices = probe_simulators()

    stranded = unavailable_devices(devices)
    if stranded:
        udids = [d["udid"] for d in stranded if d.get("udid")]
        paths = [SIM_DEVICES_ROOT / udid for udid in udids]

        def delete_unavailable(dry_run: bool, _paths=paths) -> int:
            # simctl reports nothing about what it freed, so size the directories while they exist.
            freed = sum(size_kb(p) for p in _paths)
            if not dry_run:
                proc = run("xcrun", "simctl", "delete", "unavailable")
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr.strip() or "simctl delete unavailable failed")
            return freed

        targets.append(
            Target(
                key="sim-unavailable-devices",
                group=GROUP_SAFE,
                label="Simulator devices on uninstalled runtimes",
                detail=f"{plural(len(stranded), 'device')}; `xcrun simctl delete unavailable`",
                selected=True,
                paths=paths,
                action=delete_unavailable,
            )
        )

    counts: dict[str, int] = {
        identifier: len(group) for identifier, group in (devices.get("devices") or {}).items()
    }
    # The keep-set is built before anything is removed: builds still backing an installed runtime,
    # and every asset backing a mounted runtime image.
    keep_builds = {
        r.get("buildversion")
        for r in runtimes["runtimes"]
        if counts.get(r.get("identifier", ""), 0) > 0
    }
    keep_assets = set()
    listing = run("xcrun", "simctl", "runtime", "list", "-j")
    if listing.returncode == 0:
        try:
            for image in (json.loads(listing.stdout) or {}).values():
                parent = image.get("parentMountPath")
                if parent:
                    keep_assets.add(parent.removesuffix("/AssetData"))
        except (json.JSONDecodeError, AttributeError):
            pass

    for runtime in runtimes["runtimes"]:
        identifier = runtime.get("identifier", "")
        build = runtime.get("buildversion")
        if counts.get(identifier, 0) > 0 or build in keep_builds:
            continue
        for asset in sorted(SIM_ASSETS_ROOT.glob("*.asset")):
            if asset_build(asset) != build or str(asset) in keep_assets:
                continue
            chain = detach_chain_for(asset)
            restricted = is_sip_restricted(asset)
            volume_root = volume_root_of(runtime.get("bundlePath", "") or "")

            def collect(dry_run: bool, _asset=asset, _chain=chain, _root=volume_root) -> int:
                freed = size_kb(_asset)
                if dry_run:
                    return freed
                for mount in _chain:
                    # No -force: a clean detach failing means something still holds the volume open,
                    # and forcing it there risks the process, not just the mount.
                    proc = run("hdiutil", "detach", mount, "-quiet")
                    if proc.returncode != 0:
                        raise RuntimeError(f"detach failed (still in use): {mount}")
                remove_tree(_asset, SIM_ASSETS_ROOT, sudo=True)
                if _root and not os.path.ismount(_root):
                    remove_tree(_root, SIM_VOLUMES_ROOT, sudo=True)
                return freed

            targets.append(
                Target(
                    key=f"sim-runtime-{build}",
                    group=GROUP_BLOCKED if restricted else GROUP_SAFE,
                    label=f"Orphaned simulator runtime {runtime.get('name', identifier)}",
                    state=BLOCKED if restricted else SELECTABLE,
                    detail=(
                        "0 devices; SIP-restricted, so the detach works but the delete cannot "
                        "(simdiskimaged is the entitled writer)"
                        if restricted
                        else f"0 devices; detaches {len(chain)} image(s), then removes the asset"
                    ),
                    needs_sudo=True,
                    selected=not restricted,
                    paths=[asset],
                    action=collect,
                )
            )

    stubs = (
        [
            d
            for d in sorted(SIM_DEVICES_ROOT.iterdir())
            if d.is_dir() and not (d / "device.plist").exists()
        ]
        if SIM_DEVICES_ROOT.is_dir()
        else []
    )
    if stubs:
        targets.append(
            Target(
                key="sim-device-stubs",
                group=GROUP_SAFE,
                label="Simulator device stubs",
                detail=f"{plural(len(stubs), 'directory', 'directories')} with no device.plist",
                selected=True,
                paths=stubs,
                action=delete_paths(stubs, SIM_DEVICES_ROOT),
            )
        )

    shutdown = [
        d
        for group in (devices.get("devices") or {}).values()
        for d in group
        if d.get("isAvailable") is True and d.get("state") == "Shutdown" and d.get("udid")
    ]
    if shutdown:
        paths = [SIM_DEVICES_ROOT / d["udid"] for d in shutdown]

        def erase(dry_run: bool, _devices=shutdown, _paths=paths) -> int:
            # An erase resets a device, it does not remove it, so the reclaim is what sits ABOVE a
            # fresh device rather than the whole directory. The smallest device present is the best
            # available stand-in for that floor.
            sizes = [size_kb(p) for p in _paths]
            floor = min(sizes) if sizes else 0
            if dry_run:
                return sum(max(s - floor, 0) for s in sizes)
            freed = 0
            for index, (device, path, before) in enumerate(zip(_devices, _paths, sizes), start=1):
                PROGRESS.note(f"erasing {device.get('name', device['udid'])} "
                              f"({index}/{len(_devices)})")
                proc = run("xcrun", "simctl", "erase", device["udid"])
                if proc.returncode == 0:
                    freed += before - size_kb(path)
            return freed

        targets.append(
            Target(
                key="sim-erase-shutdown",
                group=GROUP_COSTLY,
                label="Erase shutdown simulators",
                detail=f"{plural(len(shutdown), 'device')}; wipes installed dev builds and their state",
                paths=paths,
                action=erase,
            )
        )


# ---------------------------------------------------------------------------------------------
# Discovery — build products and package caches
# ---------------------------------------------------------------------------------------------


def discover_xcode(targets: list[Target]) -> None:
    entries = sorted(DERIVED_DATA.iterdir()) if DERIVED_DATA.is_dir() else []
    if entries:
        targets.append(
            Target(
                key="xcode-derived-data",
                group=GROUP_SAFE,
                label="Xcode DerivedData",
                detail=f"{plural(len(entries), 'entry', 'entries')}; next build is a cold one",
                selected=True,
                paths=entries,
                action=delete_paths(entries, DERIVED_DATA),
            )
        )

    supports = sorted(DEVICE_SUPPORT.iterdir()) if DEVICE_SUPPORT.is_dir() else []
    if supports:
        targets.append(
            Target(
                key="xcode-device-support",
                group=GROUP_COSTLY,
                label="iOS DeviceSupport",
                detail=", ".join(p.name for p in supports[:2])
                + "; re-extracted on next physical device attach",
                paths=supports,
                action=delete_paths(supports, DEVICE_SUPPORT),
            )
        )


def discover_pnpm(targets: list[Target]) -> None:
    if not shutil.which("pnpm"):
        return
    proc = run("pnpm", "store", "path", timeout=120)
    live = proc.stdout.strip()
    if proc.returncode != 0 or not live:
        return
    live_path = Path(live)
    parent = live_path.parent
    # Superseded majors only. The live store hardlinks into every workspace node_modules, so it is
    # compacted by `pnpm store prune`, never by rm.
    stale = [p for p in sorted(parent.glob("v*")) if p.is_dir() and p != live_path]
    if stale:
        targets.append(
            Target(
                key="pnpm-stale-stores",
                group=GROUP_SAFE,
                label="pnpm stores from superseded majors",
                detail=f"{', '.join(p.name for p in stale)} (live store is {live_path.name})",
                selected=True,
                paths=stale,
                action=delete_paths(stale, parent),
            )
        )

    def prune(dry_run: bool, _live=live_path) -> int:
        if dry_run:
            return 0
        before = size_kb(_live)
        run("pnpm", "store", "prune")
        return before - size_kb(_live)

    targets.append(
        Target(
            key="pnpm-store-prune",
            group=GROUP_SAFE,
            label="pnpm store prune",
            # No --dry-run, and the answer is not derivable from the store: prune drops what no
            # project references, which depends on every node_modules on the machine. Reported as
            # unknown rather than guessed.
            detail="drops unreferenced packages from the live store",
            projectable=False,
            selected=True,
            paths=[live_path],
            action=prune,
        )
    )


def discover_npm(targets: list[Target]) -> None:
    if not shutil.which("npm"):
        return
    proc = run("npm", "config", "get", "cache", timeout=120)
    root = Path(proc.stdout.strip()) if proc.returncode == 0 and proc.stdout.strip() else None
    if not root or not root.is_dir():
        return
    # `npm cache clean` empties _cacache and nothing else, so the target is _cacache alone. Sizing
    # the whole cache root would overstate it by the _npx tree, which this never touches.
    cacache = root / "_cacache"
    if not cacache.is_dir():
        return
    npx = root / "_npx"
    detail = "`npm cache clean --force`"
    if npx.is_dir():
        detail += f"; {npx.name} is a separate cache it does not remove"

    def clean(dry_run: bool, _cacache=cacache) -> int:
        before = size_kb(_cacache)
        if dry_run:
            return before
        run("npm", "cache", "clean", "--force")
        return before - size_kb(_cacache)

    targets.append(
        Target(
            key="npm-cacache",
            group=GROUP_SAFE,
            label="npm _cacache",
            detail=detail,
            selected=True,
            paths=[cacache],
            action=clean,
        )
    )


def discover_uv(targets: list[Target]) -> None:
    if not shutil.which("uv"):
        return
    proc = run("uv", "cache", "dir", timeout=120)
    cache = Path(proc.stdout.strip()) if proc.returncode == 0 and proc.stdout.strip() else None
    if not cache or not cache.is_dir():
        return

    def clean(dry_run: bool, _cache=cache) -> int:
        before = size_kb(_cache)
        if dry_run:
            return before
        run("uv", "cache", "clean")
        return before - size_kb(_cache)

    targets.append(
        Target(
            key="uv-cache",
            group=GROUP_SAFE,
            label="uv cache",
            detail="`uv cache clean`",
            selected=True,
            paths=[cache],
            action=clean,
        )
    )


def brew_projected_kb() -> int | None:
    """Homebrew's own estimate.

    It is the only cleaner here that can cost its own work up front, and its estimate spans outdated
    kegs and logs as well as the download cache — measuring `brew --cache` would miss most of what
    it actually removes.
    """
    proc = run("brew", "cleanup", "--prune=all", "--dry-run")
    if proc.returncode != 0:
        return None  # could not be asked — genuinely unknown
    multipliers = {"B": 1 / 1024, "KB": 1, "MB": 1024, "GB": 1024**2, "TB": 1024**3}
    for line in proc.stdout.splitlines():
        if "would free approximately" not in line:
            continue
        for word in line.split():
            for suffix, multiplier in multipliers.items():
                head = word.removesuffix(suffix)
                if head != word and head.replace(".", "", 1).isdigit():
                    return int(float(head) * multiplier)
    # Asked, answered, nothing to do: brew prints no estimate at all once it is clean. That is a
    # zero, not an unknown — reporting it as unknown makes a finished job look unmeasurable.
    return 0


def discover_brew(targets: list[Target]) -> None:
    if not shutil.which("brew"):
        return
    projected = brew_projected_kb()
    targets.append(
        Target(
            key="brew-cleanup",
            group=GROUP_SAFE,
            label="Homebrew cleanup",
            detail="`brew cleanup --prune=all` (outdated kegs, logs, download cache)",
            projected_kb=projected or 0,
            projectable=projected is not None,
            selected=True,
            action=lambda dry_run, _p=projected: (
                _p or 0 if dry_run else (run("brew", "cleanup", "--prune=all"), _p or 0)[1]
            ),
        )
    )


def discover_cocoapods(targets: list[Target]) -> None:
    cache = HOME / "Library/Caches/CocoaPods"
    if cache.is_dir():
        targets.append(
            Target(
                key="cocoapods-cache",
                group=GROUP_SAFE,
                label="CocoaPods cache",
                detail="re-downloaded on next pod install",
                selected=True,
                paths=[cache],
                action=delete_paths([cache], cache.parent),
            )
        )


def discover_codex(targets: list[Target]) -> None:
    """Abandoned Codex runtime install staging.

    Derived, not hardcoded: an install directory is temp-suffixed staging holding the downloaded
    archive and an extracted payload, left behind after the runtime was promoted. The live runtime
    is `codex-primary-runtime` and is never a target.
    """
    root = HOME / ".cache/codex-runtimes"
    if not root.is_dir():
        return
    staging = [p for p in sorted(root.glob("codex-runtime-install-*")) if p.is_dir()]
    if not staging:
        return
    targets.append(
        Target(
            key="codex-install-staging",
            group=GROUP_SAFE,
            label="Codex abandoned install staging",
            detail=f"{', '.join(p.name for p in staging)}; codex-primary-runtime is left alone",
            selected=True,
            paths=staging,
            action=delete_paths(staging, root),
        )
    )


def discover_gradle(targets: list[Target]) -> None:
    """One row per Gradle cache, because none of them is derivably dead.

    A `caches/<version>` directory belongs to a Gradle version that may still have an installed
    distribution and a project pinning it, and this tool cannot see every project on the machine.
    Rather than guess, each is offered separately with its last-modified date.
    """
    caches = HOME / ".gradle/caches"
    if not caches.is_dir():
        return
    # ~/.gradle/jdks is deliberately absent: a JDK swapped under a warm Gradle daemon produces
    # failures that read as missing tooling somewhere else entirely.
    dists = HOME / ".gradle/wrapper/dists"
    for entry in sorted(caches.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name == "modules-2":
            detail = "downloaded dependencies; re-downloaded on next build"
        elif entry.name.startswith("build-cache"):
            detail = "task output cache; rebuilt on next build"
        elif entry.name[0].isdigit():
            installed = (dists / f"gradle-{entry.name}-bin").exists()
            when = datetime.fromtimestamp(entry.stat().st_mtime).strftime("%Y-%m-%d")
            detail = f"Gradle {entry.name} cache, last used {when}"
            detail += "; distribution still installed" if installed else "; no distribution left"
        else:
            continue
        targets.append(
            Target(
                key=f"gradle-{entry.name}",
                group=GROUP_COSTLY,
                label=f"Gradle caches/{entry.name}",
                detail=detail,
                paths=[entry],
                action=delete_paths([entry], caches),
            )
        )


# ---------------------------------------------------------------------------------------------
# Discovery — reported, never modified
# ---------------------------------------------------------------------------------------------


def parse_docker_size(text: str) -> int:
    """Bytes from a `docker system df` reclaimable cell such as "294.3MB (8%)"."""
    token = text.strip().split()[0] if text.strip() else ""
    units = {"B": 1, "kB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4}
    for suffix in sorted(units, key=len, reverse=True):
        head = token.removesuffix(suffix)
        if head != token and head.replace(".", "", 1).replace("-", "", 1).isdigit():
            return int(float(head) * units[suffix])
    return 0


def android_sdk() -> Path:
    for env in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        value = os.environ.get(env)
        if value:
            return Path(value)
    return HOME / "Library/Android/sdk"


def discover_reported(targets: list[Target]) -> None:
    sdk = android_sdk()
    # An AVD is named by its .ini file, and that .ini's `path=` points wherever the data actually
    # lives — the two need not agree. Reading the name off the directory produces an AVD name the
    # emulator rejects with "Unknown AVD name", so enumerate .ini files as the emulator does.
    avd_root = Path(os.environ.get("ANDROID_AVD_HOME") or HOME / ".android/avd")
    if avd_root.is_dir():
        for ini in sorted(avd_root.glob("*.ini")):
            name = ini.stem
            data_dir = avd_root / f"{name}.avd"
            for line in ini.read_text(errors="replace").splitlines():
                if line.startswith("path="):
                    data_dir = Path(line[len("path=") :].strip())
            targets.append(
                Target(
                    key=f"avd-{name}",
                    group=GROUP_REPORT,
                    label=f"Android AVD {name}",
                    state=REPORT_ONLY,
                    detail=f"wipe by hand: {sdk}/emulator/emulator -avd {name} -wipe-data "
                    "(costs the native-e2e provisioning)",
                    paths=[data_dir],
                )
            )

    ndk_root = sdk / "ndk"
    if ndk_root.is_dir():
        versions = [p for p in sorted(ndk_root.iterdir()) if p.is_dir()]
        if versions:
            targets.append(
                Target(
                    key="android-ndk",
                    group=GROUP_REPORT,
                    label=f"Android NDK ({plural(len(versions), 'version')})",
                    state=REPORT_ONLY,
                    detail="Expo resolves ndkVersion at build time; which one is required "
                    "cannot be proven from here",
                    paths=versions,
                )
            )

    raw = HOME / "Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw"
    if raw.exists():
        apparent = raw.stat().st_size // 1024
        detail = (f"{human(apparent)} apparent; the gap is sparse-file slack that Docker Desktop "
                  "compaction reclaims, not prune")
        if shutil.which("docker"):
            df = run("docker", "system", "df", "--format",
                     "{{.Reclaimable}}", timeout=120)
            if df.returncode == 0 and df.stdout.strip():
                # The total is the actionable number; a per-type breakdown is four figures nobody
                # acts on separately, and it pushed the useful half of the line off the screen.
                reclaimable = sum(parse_docker_size(ln) for ln in df.stdout.splitlines())
                detail += f" — a prune would free only {human(reclaimable // 1024)}"
        targets.append(
            Target(
                key="docker-raw",
                group=GROUP_REPORT,
                label="Docker.raw",
                state=REPORT_ONLY,
                detail=detail,
                paths=[raw],
            )
        )


DISCOVERERS: list[Callable[[list[Target]], None]] = [
    discover_simulators,
    discover_xcode,
    discover_pnpm,
    discover_npm,
    discover_uv,
    discover_brew,
    discover_cocoapods,
    discover_codex,
    discover_gradle,
    discover_reported,
]


class Progress:
    """A single-line progress bar for the minute discovery spends walking tens of GB.

    Writes to stderr, never stdout: --json has to stay pipeable into jq, and a bar interleaved with
    the document would corrupt it. Silent when stderr is not a terminal, so redirected output stays
    a clean log. Advances are taken under a lock because the sizing phase reports from a thread pool.
    """

    BAR_WIDTH = 24

    def __init__(self) -> None:
        self.enabled = sys.stderr.isatty()
        self._lock = threading.Lock()
        self._phase = ""
        self._done = 0
        self._total = 0
        self._last_label = ""

    def phase(self, name: str, total: int) -> None:
        with self._lock:
            self._phase, self._done, self._total = name, 0, max(total, 1)
            self._last_label = ""
        self._draw("")

    def advance(self, label: str = "") -> None:
        with self._lock:
            self._done += 1
        self._draw(label)

    def note(self, label: str) -> None:
        """Redraw with a new label without advancing — what a long step is currently working on."""
        self._draw(label)

    def write(self, text: str) -> None:
        """Print a result line without the bar smearing into it.

        Both streams land on the same terminal, so a `\r`-drawn bar and a `\n`-terminated print
        interleave into wreckage unless the bar is erased first and redrawn after.
        """
        self.clear()
        print(text)
        sys.stdout.flush()
        self._draw(self._last_label)

    def _draw(self, label: str) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._last_label = label or self._last_label
            done, total, phase, label = self._done, self._total, self._phase, self._last_label
        filled = round(self.BAR_WIDTH * done / total)
        bar = "█" * filled + "·" * (self.BAR_WIDTH - filled)
        width = shutil.get_terminal_size((100, 24)).columns
        line = f" {phase:<11} [{bar}] {done:>2}/{total:<2}  {label}"
        sys.stderr.write("\r\033[2K" + line[: width - 1])
        sys.stderr.flush()

    def clear(self) -> None:
        if self.enabled:
            sys.stderr.write("\r\033[2K")
            sys.stderr.flush()


#: Actions are closures built during discovery, long before execution has a reporter to hand them.
#: A single shared instance lets them report progress without threading a parameter through every
#: signature.
PROGRESS: Progress = Progress()


def discover(progress: Progress | None = None) -> list[Target]:
    progress = progress or PROGRESS
    targets: list[Target] = []

    progress.phase("scanning", len(DISCOVERERS))
    for discoverer in DISCOVERERS:
        discoverer(targets)
        progress.advance(discoverer.__name__.removeprefix("discover_"))

    # Sizing dominates the wall clock — tens of GB across a dozen trees — and a picker cannot render
    # until it has numbers, so measure the trees concurrently.
    jobs: list[tuple[Target, list[Path]]] = [(t, t.paths) for t in targets if t.paths]
    progress.phase("measuring", len(jobs))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(lambda ps: sum(size_kb(p) for p in ps), paths): target
                   for target, paths in jobs}
        for future in concurrent.futures.as_completed(futures):
            target = futures[future]
            target.size_kb = future.result()
            progress.advance(target.label)

    pending = [t for t in targets if t.state == SELECTABLE and t.action and t.projectable
               and not t.projected_kb]
    progress.phase("projecting", len(pending))
    for target in targets:
        if target.state != SELECTABLE:
            target.projected_kb = 0
    for target in pending:
        try:
            target.projected_kb = target.action(True)
        except Exception:  # a projection must never abort discovery
            target.projectable = False
        progress.advance(target.label)
    progress.clear()
    targets.sort(key=lambda t: (GROUP_ORDER.index(t.group), -sort_weight(t), t.label))
    return targets


# ---------------------------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------------------------


class Style:
    """ANSI attributes, or nothing at all when the destination is not a terminal.

    Colour is applied only after a string has been padded to width. Escape sequences count toward
    len() but occupy no columns, so colouring first and aligning second silently shreds every
    column in the table.
    """

    def __init__(self, enabled: bool) -> None:
        self.on = enabled

    def _wrap(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.on else text

    def bold(self, text: str) -> str:
        return self._wrap("1", text)

    def dim(self, text: str) -> str:
        return self._wrap("2", text)

    def green(self, text: str) -> str:
        return self._wrap("32", text)

    def red(self, text: str) -> str:
        return self._wrap("31", text)

    def yellow(self, text: str) -> str:
        return self._wrap("33", text)

    def cyan(self, text: str) -> str:
        return self._wrap("36", text)


#: Wide terminals should not stretch a two-column table across the whole screen.
MAX_WIDTH = 96
VALUE_WIDTH = 12


def layout_width() -> int:
    return max(60, min(shutil.get_terminal_size((MAX_WIDTH, 24)).columns - 1, MAX_WIDTH))


def plural(count: int, singular: str, plural_form: str | None = None) -> str:
    if count == 1:
        return f"{count} {singular}"
    return f"{count} {plural_form or singular + 's'}"


def wrap_detail(text: str, width: int, limit: int = 2) -> list[str]:
    """Detail lines wrap rather than truncate — the useful half is often at the end."""
    lines = textwrap.wrap(text, width, break_long_words=False, break_on_hyphens=False)
    if len(lines) <= limit:
        return lines
    kept = lines[:limit]
    kept[-1] = ellipsize(kept[-1] + " " + lines[limit], width)
    return kept


def ellipsize(text: str, width: int) -> str:
    if width <= 1:
        return ""
    return text if len(text) <= width else text[: width - 1] + "…"


def sort_weight(target: Target) -> int:
    """Rank a row by what it displays, not by what it occupies.

    They differ: Homebrew owns no paths at all (size 0) yet projects GiB, and `pnpm store prune`
    is sized by the live store it prunes rather than by the unknown amount it releases.
    """
    if target.state == REPORT_ONLY:
        return target.size_kb
    return target.projected_kb if target.projectable else target.size_kb


def value_of(target: Target) -> str:
    """What this row contributes, never a bare 0 that could mean four different things."""
    if target.state == REPORT_ONLY:
        return human(target.size_kb)
    if target.state == BLOCKED:
        return "blocked"
    if not target.projectable:
        return "unknown"
    return human(target.projected_kb)


def selected_total(targets: Iterable[Target]) -> tuple[int, bool]:
    total, has_unknown = 0, False
    for target in targets:
        if target.state != SELECTABLE or not target.selected:
            continue
        if target.projectable:
            total += target.projected_kb
        else:
            has_unknown = True
    return total, has_unknown


def rule(width: int, title: str = "", value: str = "") -> str:
    """A horizontal rule, optionally captioned on the left and valued on the right."""
    left = f"── {title} " if title else "──"
    right = f" {value}" if value else ""
    fill = max(width - len(left) - len(right), 2)
    return left + "─" * fill + right


def print_table(targets: Sequence[Target], stream=sys.stdout) -> None:
    style = Style(stream.isatty())
    width = layout_width()
    label_width = width - VALUE_WIDTH - 7

    groups: dict[str, list[Target]] = {}
    for target in targets:
        groups.setdefault(target.group, []).append(target)

    for group, rows in groups.items():
        subtotal, unknown = 0, False
        for row in rows:
            if row.state == SELECTABLE and row.projectable:
                subtotal += row.projected_kb
            elif row.state == SELECTABLE:
                unknown = True
            else:
                # Blocked and report-only rows contribute what they OCCUPY. Summing their
                # (deliberately zero) reclaim would render 8 GiB of real disk usage as "0.0 KiB".
                subtotal += row.size_kb
        caption = human(subtotal) + ("+" if unknown else "")
        print("\n" + style.cyan(rule(width, group, caption)), file=stream)

        for row in rows:
            box = f"[{'x' if row.selected else ' '}]" if row.state == SELECTABLE else " · "
            line = f"  {box} {ellipsize(row.label, label_width):<{label_width}}"
            value = f"{value_of(row):>{VALUE_WIDTH}}"
            if row.state != SELECTABLE:
                print(style.dim(line + value), file=stream)
            elif row.selected:
                print(line + style.green(value), file=stream)
            else:
                print(style.dim(line) + value, file=stream)
            for detail_line in wrap_detail(row.detail, width - 6):
                print(style.dim(f"      {detail_line}"), file=stream)

    total, unknown = selected_total(targets)
    label = "selected (at least)" if unknown else "selected"
    print("\n" + style.dim(rule(width)), file=stream)
    print(style.bold(f"  {label:<{label_width + 4}}{human(total):>{VALUE_WIDTH}}"), file=stream)
    print(style.dim(f"  {'free on ' + DATA_VOLUME:<{label_width + 4}}"
                    f"{human(free_kb()):>{VALUE_WIDTH}}"), file=stream)


def describe_error(exc: BaseException) -> str:
    """A reason a person can act on.

    The default repr of an OSError leads with `[Errno 20]` and ends in `PosixPath(...)`, so the
    part that identifies the offending file is the first thing a narrow column truncates away.
    """
    if isinstance(exc, OSError):
        name = getattr(exc, "filename", None)
        reason = exc.strerror or exc.__class__.__name__
        return f"{reason}: {name}" if name else reason
    return str(exc) or exc.__class__.__name__


# ---------------------------------------------------------------------------------------------
# Interactive picker
# ---------------------------------------------------------------------------------------------


def pick(targets: list[Target]) -> bool:
    """Curses checkbox list. Returns True when the user confirmed a selection."""
    import curses

    def draw(screen) -> bool:
        curses.curs_set(0)
        if curses.has_colors():
            curses.use_default_colors()
            for index, colour in enumerate(
                (curses.COLOR_CYAN, curses.COLOR_GREEN, curses.COLOR_YELLOW), start=1
            ):
                curses.init_pair(index, colour, -1)
        dim = curses.A_DIM
        cursor, top = 0, 0

        rows: list[tuple[str, Target | str]] = []
        current = None
        for target in targets:
            if target.group != current:
                current = target.group
                rows.append(("group", current))
            rows.append(("target", target))
        first_target = next((i for i, (kind, _) in enumerate(rows) if kind == "target"), 0)
        cursor = first_target

        def move(delta: int) -> None:
            nonlocal cursor
            index = cursor
            while 0 <= index + delta < len(rows):
                index += delta
                if rows[index][0] == "target":
                    cursor = index
                    return

        while True:
            screen.erase()
            height, width = screen.getmaxyx()
            total, unknown = selected_total(targets)
            header = f" lrnki macOS cleanup — free {human(free_kb())} on {DATA_VOLUME}"
            screen.addnstr(0, 0, header.ljust(width - 1), width - 1, curses.A_BOLD)

            body_height = height - 3
            if cursor < top:
                top = cursor
            elif cursor >= top + body_height:
                top = cursor - body_height + 1

            for offset in range(body_height):
                index = top + offset
                if index >= len(rows):
                    break
                kind, payload = rows[index]
                y = offset + 1
                if kind == "group":
                    screen.addnstr(y, 1, str(payload).upper()[: width - 2], width - 2,
                                   curses.color_pair(1) | curses.A_BOLD)
                    continue
                target: Target = payload  # type: ignore[assignment]
                if target.state == SELECTABLE:
                    box = "[x]" if target.selected else "[ ]"
                else:
                    box = " - "
                line = f" {box} {target.label:<42}{value_of(target):>13}"
                attr = curses.A_REVERSE if index == cursor else curses.A_NORMAL
                if target.state != SELECTABLE:
                    attr |= dim
                elif target.selected:
                    attr |= curses.color_pair(2)
                screen.addnstr(y, 0, line.ljust(width - 1)[: width - 1], width - 1, attr)

            detail = rows[cursor][1].detail if rows[cursor][0] == "target" else ""  # type: ignore
            screen.addnstr(height - 2, 1, str(detail)[: width - 2], width - 2, dim)
            footer = (
                f" space toggle · a all · n none · ↵ continue · q quit"
                f"{'':<6}selected{' (at least)' if unknown else ''}: {human(total)}"
            )
            screen.addnstr(height - 1, 0, footer.ljust(width - 1)[: width - 1], width - 1,
                           curses.A_BOLD)
            screen.refresh()

            key = screen.getch()
            if key in (ord("q"), 27):
                return False
            if key in (curses.KEY_ENTER, 10, 13):
                return True
            if key in (curses.KEY_DOWN, ord("j")):
                move(1)
            elif key in (curses.KEY_UP, ord("k")):
                move(-1)
            elif key in (ord(" "), ord("x")):
                target = rows[cursor][1]  # type: ignore[assignment]
                if isinstance(target, Target) and target.state == SELECTABLE:
                    target.selected = not target.selected
            elif key == ord("a"):
                for target in targets:
                    if target.state == SELECTABLE:
                        target.selected = True
            elif key == ord("n"):
                for target in targets:
                    target.selected = False

    return curses.wrapper(draw)


# ---------------------------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------------------------


def execute(targets: Sequence[Target]) -> None:
    chosen = [t for t in targets if t.state == SELECTABLE and t.selected and t.action]
    if not chosen:
        print("\nNothing selected — nothing was removed.")
        return

    if any(t.needs_sudo for t in chosen):
        # Establish the credential before the first deletion rather than stalling for a password
        # prompt partway through a multi-step run.
        if run("sudo", "-v", timeout=120).returncode != 0:
            print("sudo credentials are required for the selected simulator targets.",
                  file=sys.stderr)
            raise SystemExit(1)

    style = Style(sys.stdout.isatty())
    width = layout_width()
    label_width = width - VALUE_WIDTH - 7

    start = free_kb()
    total, has_unknown, failures = 0, False, 0
    print("\n" + style.cyan(rule(width, "removing", plural(len(chosen), "target"))))
    PROGRESS.phase("deleting", len(chosen))
    for target in chosen:
        PROGRESS.note(target.label)
        try:
            freed = target.action(False)  # type: ignore[misc]
        except Exception as exc:
            failures += 1
            # Label on the row and reason on the detail line below, matching every other row in
            # the tool. The reason then gets the full width instead of a 14-column value cell,
            # which is what cut the offending path out of the message that reported it.
            line = f"  {style.red('✗')} {ellipsize(target.label, label_width):<{label_width}}"
            PROGRESS.write(line + style.red(f"{'not removed':>{VALUE_WIDTH}}"))
            for detail_line in wrap_detail(describe_error(exc), width - 6):
                PROGRESS.write(style.dim(f"      {detail_line}"))
            PROGRESS.advance(target.label)
            continue
        if target.projectable or freed:
            total += freed
            value = human(freed)
        else:
            has_unknown = True
            value = "done"
        line = f"  {style.green('✓')} {ellipsize(target.label, label_width):<{label_width}}"
        PROGRESS.write(line + style.green(f"{value:>{VALUE_WIDTH}}"))
        PROGRESS.advance(target.label)
    PROGRESS.clear()

    label = "reclaimed (at least)" if has_unknown else "reclaimed"
    end = free_kb()
    print(style.dim(rule(width)))
    print(style.bold(f"  {label:<{label_width + 4}}{human(total):>{VALUE_WIDTH}}"))
    print(style.dim(f"  {'free on ' + DATA_VOLUME:<{label_width + 4}}"
                    f"{human(end):>{VALUE_WIDTH}}"))
    if failures:
        print(style.yellow(f"  {plural(failures, 'target')} did not complete; "
                          "nothing else was affected"))
    drift = end - start
    if abs(drift - total) > 262144:
        print(style.dim(f"  free space moved {human(drift)} overall, which also includes "
                        "other processes"))


# ---------------------------------------------------------------------------------------------


def main(argv: Sequence[str] | None = None) -> int:
    global PROGRESS
    PROGRESS = Progress()
    parser = argparse.ArgumentParser(
        prog="cleanup-macos-dev.py",
        description="Reclaim developer-toolchain disk space on macOS. Nothing is removed until you "
        "confirm.",
    )
    parser.add_argument("--yes", action="store_true",
                        help="skip the picker and act on the default selection")
    parser.add_argument("--select", metavar="KEY,...",
                        help="skip the picker and act on the named targets")
    parser.add_argument("--json", action="store_true",
                        help="print the discovered targets as JSON and exit; never removes anything")
    args = parser.parse_args(argv)

    if sys.platform != "darwin":
        print(f"Refusing to run: this targets macOS developer toolchains, found {sys.platform}.",
              file=sys.stderr)
        return 1
    for tool in ("xcrun", "hdiutil", "du"):
        if not shutil.which(tool):
            print(f"Refusing to run: {tool} is required and is not on PATH.", file=sys.stderr)
            return 1

    try:
        targets = discover()
    except ProbeError as exc:
        print(f"Refusing to continue: {exc}", file=sys.stderr)
        return 1

    if args.json:
        json.dump([t.as_json() for t in targets], sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    if args.select is not None:
        wanted = {k.strip() for k in args.select.split(",") if k.strip()}
        # Only selectable keys are offered: naming a blocked or report-only target would otherwise
        # be accepted and then silently do nothing.
        known = {t.key for t in targets if t.state == SELECTABLE}
        unknown_keys = wanted - known
        if unknown_keys:
            print(f"Not selectable: {', '.join(sorted(unknown_keys))}", file=sys.stderr)
            print(f"Selectable: {', '.join(sorted(known))}", file=sys.stderr)
            return 2
        for target in targets:
            target.selected = target.state == SELECTABLE and target.key in wanted
    elif not args.yes:
        if not (sys.stdout.isatty() and sys.stdin.isatty()):
            # Piped or redirected: report and exit without touching anything, so
            # `pnpm clean:macos | less` stays safe.
            print_table(targets)
            print("\nNot a terminal — nothing was removed. Re-run in a terminal, "
                  "or pass --yes / --select.")
            return 0
        if not pick(targets):
            print("Aborted; nothing was removed.")
            return 0

    print_table(targets)
    execute(targets)
    return 0


if __name__ == "__main__":
    sys.exit(main())
