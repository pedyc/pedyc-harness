export const greet = (name) => `hello ${name}`

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(greet('node example'))
}
