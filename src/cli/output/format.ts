export function printData(data: unknown, jsonOutput: boolean): void {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      process.stdout.write('No records found.\n');
      return;
    }

    console.table(data);
    return;
  }

  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printError(error: unknown, jsonOutput: boolean): void {
  if (error instanceof Error) {
    const payload = {
      error: error.name,
      message: error.message,
    };

    if (jsonOutput) {
      process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
      return;
    }

    process.stderr.write(`${payload.error}: ${payload.message}\n`);
    return;
  }

  process.stderr.write('Unknown error\n');
}
