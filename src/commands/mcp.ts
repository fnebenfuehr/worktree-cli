import { startMCPServer } from '@/mcp/server';
import { intro, log, outro } from '@/utils/prompts';

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
	log.error('Not implemented yet');
	outro('Test failed');
	return 1;
}
