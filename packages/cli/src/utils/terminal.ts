export function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}
