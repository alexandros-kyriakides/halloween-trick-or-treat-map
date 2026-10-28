const SIM = new URL('../devsim/appsync-utils.js', import.meta.url).href;
export async function resolve(specifier, context, next) {
  if (specifier === '@aws-appsync/utils') return { url: SIM, shortCircuit: true };
  return next(specifier, context);
}
