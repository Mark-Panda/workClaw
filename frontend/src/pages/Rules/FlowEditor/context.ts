import { createContext } from 'react';

/** Context so node components can trigger a DSL sync after form edits. */
export const NotifyContext = createContext<() => void>(() => {});
