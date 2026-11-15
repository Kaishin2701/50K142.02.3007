import { configure } from '@testing-library/dom';
// findBy* / waitFor default timeout: 1000ms is too tight for integration tests
// running in the full suite under CPU load. Raise to 5000ms so async mocks
// have enough time to resolve without touching individual test files.
configure({ asyncUtilTimeout: 5000 });
