export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Serve the UI from /public
    if (url.pathname === "/") {
      return env.ASSETS.fetch(req);
    }

    // Chat API endpoint
    if (url.pathname === "/api/chat" && req.method === "POST") {
      const { message, sessionId } = await req.json();

      const id = env.SESSION_DO.idFromName(sessionId);
      const stub = env.SESSION_DO.get(id);

      return stub.fetch("http://do/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    }

    return new Response("Not found", { status: 404 });
  }
};

// Durable Object for conversation memory
export class SessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.messages = [];
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/chat" && req.method === "POST") {
      const { message } = await req.json();

      // Save user message
      this.messages.push({ role: "user", content: message });

      try {
        // Call Workers AI – Llama 3 Instruct
        const aiResult = await this.env.AI.run(
          "@cf/meta/llama-3-8b-instruct",
          {
            messages: this.messages
          }
        );

        const content =
          aiResult?.response ??
          aiResult?.result?.response ??
          aiResult?.result?.output_text ??
          "";

        if (!content) {
          throw new Error("Workers AI returned an empty response");
        }

        const reply = {
          role: "assistant",
          content
        };

        // Save assistant reply
        this.messages.push(reply);

        return new Response(JSON.stringify(reply), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("AI call failed", err);
        return new Response(
          JSON.stringify({
            error:
              "Workers AI request failed: " + (err?.message ?? "Unknown error"),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  }
}
