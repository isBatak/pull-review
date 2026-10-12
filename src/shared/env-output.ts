export function parseEnvOutput(output: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of output.split('\0')) {
    const index = entry.indexOf('=')
    if (index > 0)
      env[entry.slice(0, index)] = entry.slice(index + 1)
  }
  return env
}
