export const greeting = 'generic example ready'

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(greeting)
}
