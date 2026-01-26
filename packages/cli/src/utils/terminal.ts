export function writeStdout(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }

    let data = "";
    const handleData = (chunk: Buffer | string) => {
      data += chunk.toString();
    };
    const handleEnd = () => {
      cleanup();
      resolve(data);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      process.stdin.off("data", handleData);
      process.stdin.off("end", handleEnd);
      process.stdin.off("error", handleError);
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", handleData);
    process.stdin.on("end", handleEnd);
    process.stdin.on("error", handleError);
    process.stdin.resume();
  });
}
