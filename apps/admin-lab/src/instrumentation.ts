export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTopicGenerationSupervisor } = await import("./lib/topicGenerationSupervisor");
    startTopicGenerationSupervisor();
  }
}
