// Quality Lab: off-core measurement modules (ADR-0013, AGENTS rule 11). Nothing
// here ever publishes or mutates a graph; it measures the production pipeline
// against frozen, model-authored oracle references and quarantines disagreements.
export {
  buildAdmissionOracle,
  scoreAdmissionOracle,
  scoreAdmissionOracleAligned,
  alignAdmissionLabels,
  type AdmissionOracleSource
} from "./admissionOracle";
