import type Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DEFINITIONS, executeTool, ToolDeps, defaultToolDeps } from "./tools";

export const MODEL = "claude-opus-4-8";

export interface TurnResult {
  messages: Anthropic.MessageParam[];
  responseText: string;
}

/**
 * Runs one user turn to completion: sends the user's input to Claude, executes
 * any tool calls Claude makes, and loops until Claude produces a non-tool_use
 * response. Control returns to the caller (the terminal REPL) once this
 * resolves — the loop does not span multiple user turns.
 */
export async function runTurn(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  userInput: string,
  deps: ToolDeps = defaultToolDeps,
): Promise<TurnResult> {
  const updated: Anthropic.MessageParam[] = [
    ...messages,
    { role: "user", content: userInput },
  ];

  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      thinking: { type: "adaptive" },
      messages: updated,
    });

    updated.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      return { messages: updated, responseText };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const content = await executeTool(block.name, block.input, deps);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
      }
    }
    updated.push({ role: "user", content: toolResults });
  }
}
