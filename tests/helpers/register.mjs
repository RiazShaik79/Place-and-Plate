// `node --import ./tests/helpers/register.mjs` installs the TypeScript resolve hooks for unit tests.
import { register } from "node:module";

register("./ts-hooks.mjs", import.meta.url);
