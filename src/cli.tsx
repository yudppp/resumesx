#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './app.js';
import { loadProviders } from './providers/index.js';
import { scanProviders } from './lib/scan.js';
import { spawnInteractive } from './lib/exec.js';
import { ResumeCommand } from './types.js';

const cli = meow(
  `
	Usage
	  $ resumesx [options]

	Options
	  --last, -l     Resume the most recent tool without UI
	  --limit, -n    Number of events to load
	  --help, -h     Show help
	  --version, -v  Show version

	Examples
	  $ resumesx
	  $ resumesx --last
	  $ resumesx --help
	  $ resumesx --version
	`,
  {
    importMeta: import.meta,
    flags: {
      limit: { type: 'number', shortFlag: 'n' },
      last: { type: 'boolean', shortFlag: 'l' },
      help: { type: 'boolean', shortFlag: 'h' },
      version: { type: 'boolean', shortFlag: 'v' },
    },
  },
);

const main = async () => {
  if (cli.flags.version) {
    console.log(cli.pkg.version);
    return;
  }

  if (cli.flags.help) {
    console.log(cli.help);
    return;
  }

  const providers = await loadProviders();
  const rawLimit = cli.flags.limit;
  const limit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0
      ? rawLimit
      : undefined;
  const { events, latest } = await scanProviders(providers, limit);

  if (cli.flags.last) {
    if (!latest) {
      console.log('No activity found.');
      process.exitCode = 1;
      return;
    }

    if (!latest.resume) {
      console.log(`${latest.label} does not support resume command.`);
      process.exitCode = 1;
      return;
    }

    const resume = latest.resume;
    console.log(`Launching: ${resume.command} ${resume.args.join(' ')}`.trim());
    await spawnInteractive(resume.command, resume.args);
    return;
  }

  const selectedResume: { value: ResumeCommand | null } = { value: null };
  const onResume = (resume: ResumeCommand) => {
    selectedResume.value = resume;
  };

  const { waitUntilExit } = render(<App events={events} onResume={onResume} />);

  await waitUntilExit();

  if (selectedResume.value) {
    await spawnInteractive(selectedResume.value.command, selectedResume.value.args);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
