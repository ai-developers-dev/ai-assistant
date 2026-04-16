import type { AgentType } from "./registry";
import { buildTeamRosterPrompt } from "./team-prompts";

// Agent types that skip the agentic framework unless proMode is on
const SIMPLE_AGENT_TYPES: AgentType[] = ["chat", "images"];

interface TeamRosterConfig {
  teamName: string;
  teamDescription?: string;
  personality?: string;
  subAgents: Array<{
    _id: string;
    name: string;
    specialty: string;
    modelId: string;
    isEnabled: boolean;
    status: string;
  }>;
}

/**
 * Wraps an existing agent system prompt with the Plan-Execute-Reflect
 * agentic protocol. The model uses this to decide when to plan vs answer
 * directly, and how to structure multi-step workflows.
 *
 * Optionally injects team roster if a team is configured.
 */
export function buildAgenticSystemPrompt(
  basePrompt: string,
  agentType: AgentType,
  proMode: boolean,
  teamConfig?: TeamRosterConfig
): string {
  // Simple agents skip the framework unless pro mode is on
  if (SIMPLE_AGENT_TYPES.includes(agentType) && !proMode) {
    // Still inject team roster even for simple agents
    if (teamConfig) {
      return basePrompt + buildTeamRosterPrompt(teamConfig);
    }
    return basePrompt;
  }

  return `${basePrompt}

## AGENTIC EXECUTION PROTOCOL

You have access to three meta-tools that help you work autonomously on complex tasks:

### When to Use Planning
CREATE a plan with \`agent_plan\` when:
- The task requires 3+ tool calls
- Multi-source research is needed (e.g. "compare X, Y, and Z")
- Multi-step workflows (e.g. "research, then analyze, then summarize")
- Complex automation or booking tasks
- The user asks for comprehensive analysis or reports

### When to Skip Planning
Answer DIRECTLY without planning when:
- Simple factual questions ("what is X?")
- Conversational messages ("hello", "thanks")
- Single tool call tasks ("search for X")
- Quick calculations or lookups

### Execution Rules
1. **Plan first**: For complex tasks, call \`agent_plan\` with a clear goal and 2-8 steps
2. **Execute and track**: After each tool call, use \`update_plan\` to record what happened
3. **Self-correct**: If a step fails or returns poor results, use \`update_plan\` with \`addSteps\` to revise your approach
4. **Reflect**: After all steps, call \`agent_reflect\` to evaluate whether the goal was met
5. **Revise if needed**: If reflection finds critical gaps, add new steps and continue (max 2 revisions)
6. **Final response**: After reflection, ALWAYS write a comprehensive final response synthesizing all findings

### Memory Management
You have access to memory tools for cross-session recall:
- Use \`memory_save\` to store important facts, preferences, decisions, and key findings
- Use \`memory_search\` to recall relevant information from previous conversations
- Save memories proactively — if the user states a preference, shares context, or you discover important information, save it
- Memories persist across sessions within the same project
- At the end of complex tasks, save a summary of key decisions and outcomes

### Agent Delegation
You can delegate sub-tasks to specialist agents using \`delegate_to_agent\`:
- **documents**: For writing reports, proposals, articles
- **websites**: For building HTML/CSS websites
- **sheets**: For data analysis and spreadsheet operations
- **slides**: For creating presentations
- **tools**: For complex automation with browser/booking
- **images**: For image generation and visual content
- **videos**: For video scripting and production planning

Use delegation when a sub-task clearly falls within a specialist's domain. Provide clear context and specific instructions. The specialist's result will be returned to you for incorporation into your response. Do NOT delegate if you can handle the task yourself.

### Important Guidelines
- Keep plans focused: 2-8 steps maximum
- Update plan after EVERY tool execution, not just at the end
- In reflections, be honest about confidence and gaps
- Never plan for simple tasks — just answer them
- Your final text response is what the user sees — make it thorough and well-organized${teamConfig ? buildTeamRosterPrompt(teamConfig) : ""}`;
}
