import { createContext } from 'react';
import type { RuleNodeRegistry } from './nodes/types';

/** Context so node components can trigger a DSL sync after form edits. */
export const NotifyContext = createContext<() => void>(() => {});

/** Context providing node registries so components like NodeAdder can access them without prop drilling. */
export const RegistriesContext = createContext<RuleNodeRegistry[]>([]);
