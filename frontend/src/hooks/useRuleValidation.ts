import { useState, useCallback } from 'react';
import { validateRule } from '../api/rules';
import type { RuleChainDsl } from '../types/rule';

export function useRuleValidation() {
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    warnings: string[];
  } | null>(null);
  const [validating, setValidating] = useState(false);

  const validate = useCallback(async (dsl: RuleChainDsl) => {
    setValidating(true);
    try {
      const result = await validateRule(dsl);
      setValidationResult(result);
      return result;
    } finally {
      setValidating(false);
    }
  }, []);

  return { validate, validationResult, validating };
}
