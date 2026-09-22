#!/usr/bin/env node
/**
 * Prints the Play Store "what's new" text for the build at hand, so the
 * Android release workflow can hand it to the Play Developer API.
 *
 * Environment:
 *   RELEASE_BODY    body of the GitHub release, empty for test builds
 *   COMMIT_SUBJECTS commit subjects since the last tag, one per line
 *
 * The text goes to stdout; an empty result means "do not set release notes".
 */
import { buildPlayReleaseNotes } from '../src/server/play/releaseNotes.ts';

const commitSubjects = (process.env.COMMIT_SUBJECTS ?? '')
  .split('\n')
  .filter((subject) => subject.trim() !== '');

process.stdout.write(
  buildPlayReleaseNotes({
    releaseBody: process.env.RELEASE_BODY ?? '',
    commitSubjects,
  })
);
