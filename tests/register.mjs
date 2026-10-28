// Makes `import ... from '@aws-appsync/utils'` in the resolvers load the local simulator.
import { register } from 'node:module';
register(new URL('./hooks.mjs', import.meta.url));
