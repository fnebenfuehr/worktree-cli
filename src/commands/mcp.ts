import { startMCPServer } from '@/mcp/server';
import { intro, log, outro } from '@/utils/prompts';

const EXPECTED_TOOL_COUNT = 6;

interface JsonRpcResponse {
	jsonrpc: string;
	id: number;
	result?: {
		tools?: unknown[];
	};
	error?: {
		message: string;
	};
}

export async function mcpStartCommand(): Promise<number> {
	await startMCPServer();
	return 0;
}

export async function mcpConfigCommand(options?: { json?: boolean }): Promise<number> {
	const config = {
		mcpServers: {
			worktree: {
				command: 'worktree',
				args: ['mcp', 'start'],
			},
		},
	};

	if (options?.json) {
		console.log(JSON.stringify(config, null, 2));
		return 0;
	}

	intro('MCP Server Configuration');

	log.message('Add this to your AI assistant configuration:\n');

	log.step('Claude Desktop (~/.config/Claude/claude_desktop_config.json):');
	log.message(JSON.stringify(config, null, 2));
	log.message('');

	log.step('Cody (VS Code settings.json):');
	log.message(JSON.stringify({ 'mcp.servers': config.mcpServers }, null, 2));
	log.message('');

	log.step('Cursor (.cursor/config.json):');
	log.message(JSON.stringify(config, null, 2));

	outro('After adding, restart your AI assistant. Test with: worktree mcp test');

	return 0;
}

export async function mcpTestCommand(): Promise<number> {
	intro('Testing MCP Server');

	const spawn = Bun.spawn(['bun', 'run', './dist/index.js', 'mcp', 'start'], {
		stdin: 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});

	try {
		log.step('Starting MCP server');

		const testRequest = {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
			params: {},
		};

		spawn.stdin.write(`${JSON.stringify(testRequest)}\n`);
		spawn.stdin.end();

		log.step('Sending tools/list request');

		const output = await new Response(spawn.stdout).text();

		const lines = output.trim().split('\n');
		let response: JsonRpcResponse | null = null;

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line);
				if (parsed.id === 1) {
					response = parsed as JsonRpcResponse;
					break;
				}
			} catch {}
		}

		if (!response) {
			log.error('No valid response from server');
			spawn.kill();
			outro('Test failed');
			return 1;
		}

		if (response.error) {
			log.error(`Server error: ${response.error.message}`);
			spawn.kill();
			outro('Test failed');
			return 1;
		}

		const toolCount = response.result?.tools?.length || 0;

		if (toolCount !== EXPECTED_TOOL_COUNT) {
			log.error(`Expected ${EXPECTED_TOOL_COUNT} tools, got ${toolCount}`);
			spawn.kill();
			outro('Test failed');
			return 1;
		}

		log.step(`✓ Server started successfully`);
		log.step(`✓ Tools registered (${toolCount} tools available)`);
		log.step('✓ Server responds to requests');

		spawn.kill();
		outro('Ready to use with AI assistants!');
		return 0;
	} catch (error) {
		spawn.kill();
		log.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
		outro('Test failed');
		return 1;
	}
}
