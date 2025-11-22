import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	type CallToolRequest,
	CallToolRequestSchema,
	type ListToolsRequest,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../../package.json';
import * as tools from './tools';

export async function startMCPServer(): Promise<void> {
	const server = new Server(
		{
			name: 'worktree-cli',
			version: packageJson.version,
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
		return {
			tools: [
				{
					name: 'worktree_status',
					description:
						'Check if repo uses worktrees, current branch, and the default branch. When starting a new task or switching context, check this first. If currently on the default branch (as returned by this tool), you MUST create or switch to a worktree before modifications.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'worktree_list',
					description:
						'List all worktrees to see existing work contexts. Before creating new worktrees, check if a relevant branch exists for the current task. Shows active branches and their paths.',
					inputSchema: {
						type: 'object',
						properties: {},
					},
				},
				{
					name: 'worktree_create',
					description:
						'Create worktree for isolated work. Smart creation: REUSE existing if continuing related work (e.g., more auth features on feat/auth). CREATE NEW for: different concerns, risky changes, or unrelated work. Branch naming follows Conventional Commits: feat/*, fix/*, chore/*, docs/*, style/*, refactor/*, test/*, build/*, ci/*. When unsure about overlap, ask user or create new for safety.',
					inputSchema: {
						type: 'object',
						properties: {
							branch: {
								type: 'string',
								description: 'Branch name (e.g., feat/dark-mode, fix/login-bug)',
							},
							baseBranch: {
								type: 'string',
								description: 'Base branch to create from (defaults to main)',
							},
						},
						required: ['branch'],
					},
				},
				{
					name: 'worktree_switch',
					description:
						'Switch to a worktree to work in that context. Use when changing between different work areas or after creating a new worktree. Returns the path where you can access files directly.',
					inputSchema: {
						type: 'object',
						properties: {
							branch: {
								type: 'string',
								description: 'Branch name or worktree identifier',
							},
						},
						required: ['branch'],
					},
				},
				{
					name: 'worktree_remove',
					description:
						'Remove merged or abandoned worktrees. After pushing/merging PRs, proactively suggest cleanup. Check git log for merged branches. Never force unless user explicitly requests.',
					inputSchema: {
						type: 'object',
						properties: {
							identifier: {
								type: 'string',
								description: 'Branch name or path',
							},
							force: {
								type: 'boolean',
								description: 'Force removal (default: false)',
							},
						},
						required: ['identifier'],
					},
				},
				{
					name: 'worktree_setup',
					description:
						'Convert repo to worktree structure. Use when user wants to enable worktrees for first time. Moves current repo to bare structure with main worktree.',
					inputSchema: {
						type: 'object',
						properties: {
							targetDir: {
								type: 'string',
								description: 'Parent directory (defaults to ../)',
							},
						},
					},
				},
				{
					name: 'worktree_checkout',
					description:
						'Intelligent checkout: switches to worktree if branch exists in a worktree, creates worktree from local branch if it exists locally, or creates worktree from remote branch if found on remote. Automatically handles branch discovery and worktree creation. Preferred over worktree_create when working with existing branches.',
					inputSchema: {
						type: 'object',
						properties: {
							branch: {
								type: 'string',
								description: 'Branch name to checkout',
							},
						},
						required: ['branch'],
					},
				},
				{
					name: 'worktree_pr',
					description:
						'Checkout a GitHub PR by number or URL. Fetches PR info, creates worktree from PR branch, and shows PR details. Requires GitHub CLI (gh) to be installed and authenticated.',
					inputSchema: {
						type: 'object',
						properties: {
							prInput: {
								type: 'string',
								description:
									'PR number or GitHub PR URL (e.g., "123" or "https://github.com/owner/repo/pull/123")',
							},
						},
						required: ['prInput'],
					},
				},
			],
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
		const { name, arguments: args } = request.params;

		switch (name) {
			case 'worktree_status': {
				const result = await tools.worktreeStatus();
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_list': {
				const result = await tools.worktreeList();
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_create': {
				const { branch, baseBranch } = args as { branch: string; baseBranch?: string };
				const result = await tools.worktreeCreate(branch, baseBranch);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_switch': {
				const { branch } = args as { branch: string };
				const result = await tools.worktreeSwitch(branch);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_remove': {
				const { identifier, force } = args as { identifier: string; force?: boolean };
				const result = await tools.worktreeRemove(identifier, force);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_setup': {
				const { targetDir } = args as { targetDir?: string };
				const result = await tools.worktreeSetup(targetDir);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_checkout': {
				const { branch } = args as { branch: string };
				const result = await tools.worktreeCheckout(branch);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			case 'worktree_pr': {
				const { prInput } = args as { prInput: string };
				const result = await tools.worktreePr(prInput);
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify(result, null, 2),
						},
					],
				};
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
	});

	const transport = new StdioServerTransport();
	await server.connect(transport);
}
