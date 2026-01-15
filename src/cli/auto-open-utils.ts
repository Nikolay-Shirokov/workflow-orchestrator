/**
 * Утилиты для автооткрытия основного результата
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowState } from '../core/types.js';

const MAIN_OUTPUT_EXTENSIONS = new Set(['.md', '.txt', '.yaml', '.json']);

function isMainOutputFile(filePath: string): boolean {
  return MAIN_OUTPUT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findMainOutputPath(
  state: WorkflowState
): Promise<string | undefined> {
  const historyCandidates: string[] = [];

  for (const history of state.history || []) {
    for (const artifactPath of history.artifacts || []) {
      if (isMainOutputFile(artifactPath)) {
        historyCandidates.push(artifactPath);
      }
    }
  }

  for (let i = historyCandidates.length - 1; i >= 0; i--) {
    if (await fileExists(historyCandidates[i])) {
      return historyCandidates[i];
    }
  }

  const artifactPaths = Object.values(state.artifacts || {});
  const timestampCandidates: Array<{ path: string; mtime: number }> = [];

  for (const artifactPath of artifactPaths) {
    if (!isMainOutputFile(artifactPath)) {
      continue;
    }

    try {
      const stats = await fs.stat(artifactPath);
      timestampCandidates.push({
        path: artifactPath,
        mtime: stats.mtimeMs || stats.birthtimeMs
      });
    } catch {
      // Игнорируем отсутствующие артефакты
    }
  }

  if (timestampCandidates.length === 0) {
    return undefined;
  }

  timestampCandidates.sort((a, b) => a.mtime - b.mtime);
  return timestampCandidates[timestampCandidates.length - 1].path;
}

