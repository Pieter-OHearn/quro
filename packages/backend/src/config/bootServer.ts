import { bootConfig } from './index';

// Imported first by the server entry point. ES modules evaluate in import order, so this runs
// before any module that reads the database settings at load time, and an invalid setting stops
// the process with the full list of problems instead of a stack trace from the first reader.
bootConfig('server');
