/**
 * Dynamic system prompt builder for team-aware agents.
 * Injects the team roster, delegation instructions, and sub-agent identity
 * into system prompts when a team is configured.
 */

interface TeamAgent {
  _id: string;
  name: string;
  specialty: string;
  modelId: string;
  isEnabled: boolean;
  status: string;
}

interface TeamConfig {
  teamName: string;
  teamDescription?: string;
  personality?: string;
  subAgents: TeamAgent[];
}

/**
 * Build the team roster section for the main agent's system prompt.
 * This tells the main agent about its sub-agents and how to delegate.
 */
export function buildTeamRosterPrompt(config: TeamConfig): string {
  const enabledAgents = config.subAgents.filter((a) => a.isEnabled);

  if (enabledAgents.length === 0) {
    return "";
  }

  const agentList = enabledAgents
    .map(
      (a, i) =>
        `${i + 1}. **${a.name}** (${a.specialty}) — model: ${a.modelId}`
    )
    .join("\n");

  let prompt = `\n\n## Your Team

You are **${config.teamName}**, the Swarm Leader for this organization.`;

  if (config.personality) {
    prompt += `\n${config.personality}`;
  }

  if (config.teamDescription) {
    prompt += `\n${config.teamDescription}`;
  }

  prompt += `

### Team Members
${agentList}

### CRITICAL: You are a PURE ORCHESTRATOR
- You NEVER execute tasks directly. You ALWAYS delegate to your team members.
- For EVERY user request, analyze what needs to be done, then delegate to the right sub-agent(s).
- Use \`delegate_to_team_agent\` for ALL task execution -- even simple tasks.
- For multi-part tasks, break them into sub-tasks and delegate sequentially.
- After receiving results from sub-agents, SYNTHESIZE their outputs into a cohesive response.
- If no sub-agent matches perfectly, delegate to the closest match.
- Provide CLEAR, SPECIFIC instructions when delegating -- include all context.
- When synthesizing, add your own analysis, formatting, and recommendations.

### How to Decide Which Agent(s) to Use
1. Parse the user's request into discrete sub-tasks
2. Match each sub-task to the best specialist
3. For tasks needing multiple specialties, delegate sequentially -- pass each result as context to the next
4. For ambiguous tasks, delegate to the closest specialty match
5. Always delegate -- never say "I'll handle this myself"`;

  return prompt;
}

/**
 * Build the system prompt for a sub-agent during delegated execution.
 * Sub-agents get their specialty prompt + custom instructions + task context.
 */
export function buildSubAgentPrompt(
  subAgentName: string,
  specialtyPromptSnippet: string,
  customPrompt?: string,
  mainAgentName?: string
): string {
  let prompt = `You are **${subAgentName}**, a specialist AI agent.

${specialtyPromptSnippet}`;

  if (customPrompt) {
    prompt += `\n\n## Additional Instructions\n${customPrompt}`;
  }

  if (mainAgentName) {
    prompt += `\n\n## Team Context
You are part of a team led by **${mainAgentName}**. You've been assigned a specific task. Complete it thoroughly and return your results. You cannot delegate to other agents — focus on completing the task directly.`;
  }

  return prompt;
}
