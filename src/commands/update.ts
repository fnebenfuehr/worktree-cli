import { spawn } from 'node:child_process';
import type { PackageJson } from '@/lib/types';
import { WorktreeError } from '@/utils/errors';
import { intro, log, outro, spinner } from '@/utils/prompts';
import { fetchLatestVersion, isNewerVersion, writeCache } from '@/utils/update';

/**
 * Runs npm update -g for the package and returns the new version
 */
export async function runNpmUpdate(
	packageName: string
): Promise<{ success: boolean; error?: string }> {
	return new Promise((resolve) => {
		const child = spawn('npm', ['update', '-g', packageName], {
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true,
		});

		let stderr = '';

		child.stderr?.on('data', (data) => {
			stderr += data.toString();
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve({ success: true });
			} else {
				if (stderr.includes('EACCES') || stderr.includes('permission denied')) {
					resolve({
						success: false,
						error: `Permission denied. Try running with sudo:\n  sudo npm update -g ${packageName}`,
					});
				} else {
					resolve({
						success: false,
						error: stderr || `npm update failed with exit code ${code}`,
					});
				}
			}
		});

		child.on('error', (err) => {
			if (err.message.includes('ENOENT')) {
				resolve({
					success: false,
					error: 'npm not found. Please ensure npm is installed and in your PATH.',
				});
			} else {
				resolve({ success: false, error: err.message });
			}
		});
	});
}

/**
 * Gets the currently installed version by running npm list
 */
export async function getInstalledVersion(packageName: string): Promise<string | null> {
	return new Promise((resolve) => {
		const child = spawn('npm', ['list', '-g', packageName, '--depth=0', '--json'], {
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true,
		});

		let stdout = '';

		child.stdout?.on('data', (data) => {
			stdout += data.toString();
		});

		child.on('close', () => {
			try {
				const result = JSON.parse(stdout);
				const version = result.dependencies?.[packageName]?.version;
				resolve(version || null);
			} catch {
				resolve(null);
			}
		});

		child.on('error', () => {
			resolve(null);
		});
	});
}

export async function updateCommand(pkg: PackageJson): Promise<number> {
	intro('Update CLI');

	const s = spinner();

	s.start('Checking current version');
	const installedVersion = (await getInstalledVersion(pkg.name)) || pkg.version;
	s.stop(`Current version: ${installedVersion}`);

	s.start('Checking for updates');
	const latestVersion = await fetchLatestVersion(pkg.name);

	if (!latestVersion) {
		s.stop('Could not fetch latest version from npm registry');
		log.warn('Unable to check for updates. Please check your network connection.');
		return 1;
	}

	if (!isNewerVersion(installedVersion, latestVersion)) {
		s.stop(`Already up to date (${installedVersion})`);
		outro('No update needed');
		return 0;
	}

	s.stop(`Update available: ${installedVersion} → ${latestVersion}`);

	s.start(`Updating to ${latestVersion}`);
	const result = await runNpmUpdate(pkg.name);

	if (!result.success) {
		s.stop('Update failed');
		throw new WorktreeError(result.error || 'Update failed', 'UPDATE_FAILED', 1);
	}

	const newVersion = await getInstalledVersion(pkg.name);
	s.stop(`Updated successfully`);

	if (newVersion && newVersion !== installedVersion) {
		log.success(`Updated: ${installedVersion} → ${newVersion}`);
	} else if (newVersion === installedVersion) {
		log.info('Version unchanged. You may already have the latest version.');
	}

	outro('Update complete');
	return 0;
}

/**
 * Check for updates and return version info (for --version flag enhancement)
 */
export async function getVersionInfo(
	pkg: PackageJson
): Promise<{ current: string; latest: string | null; updateAvailable: boolean }> {
	const latest = await fetchLatestVersion(pkg.name);
	const updateAvailable = latest ? isNewerVersion(pkg.version, latest) : false;

	await writeCache({
		lastCheck: Date.now(),
		latestVersion: latest || undefined,
	});

	return {
		current: pkg.version,
		latest,
		updateAvailable,
	};
}
