import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  StreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";

type MaybePromise<T> = T | Promise<T>;

export type CreateStatefulMcpHandlerOptions = {
  stateful: true;
  getTransport: (
    sessionId: string | null,
  ) => MaybePromise<StreamableHTTPServerTransport>;
};

export type CreateStatelessMcpHandlerOptions = {
  stateful?: false;
  newServer: () => MaybePromise<McpServer>;
};

export type CreateMcpHandlerOptions =
  | CreateStatefulMcpHandlerOptions
  | CreateStatelessMcpHandlerOptions;

export function createMcpHandler(
  options: CreateMcpHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const { req, res } = toReqRes(request);

    if (options.stateful) {
      // Handle stateful MCP servers

      const sessionId = request.headers.get("mcp-session-id");
      const reqBody = await request.json();

      if (!sessionId && !isInitializeRequest(reqBody)) {
        // No existing session & is not creating session
        return Response.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          },
          { status: 400 },
        );
      }

      // Get existing session or create a new session
      const transport = await options.getTransport(sessionId);
      await transport.handleRequest(req, res, reqBody);
    } else {
      // Handle stateless MCP servers

      const server = await options.newServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, await request.json());
      res.on("close", () => {
        transport.close();
        server.close();
      });
    }

    return await toFetchResponse(res);
  };
}
