import os from 'os';
import path from 'path';
import fs from 'fs';

export const resolveHome = (inputPath: string) => {
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }

  return inputPath;
};

export const pathExists = async (filePath: string) => {
  try {
    await fs.promises.stat(filePath);
    return true;
  } catch {
    return false;
  }
};

export const readDirSafe = async (dirPath: string) => {
  try {
    return await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
};

export const statSafe = async (filePath: string) => {
  try {
    return await fs.promises.stat(filePath);
  } catch {
    return null;
  }
};
