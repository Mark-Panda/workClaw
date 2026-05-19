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
    } catch (err: any) {
      const status = err?.response?.status;
      let msg = '验证服务异常';
      if (status === 422) msg = '验证服务异常：DSL 格式不合法';
      else if (status === 413) msg = '验证服务异常：DSL 体积过大';
      else if (status === 503) msg = '验证服务不可用，请稍后重试';
      else if (!status) msg = '网络连接失败，无法验证';
      const errResult = { valid: false, warnings: [msg] };
      setValidationResult(errResult);
      return errResult;
    } finally {
      setValidating(false);
    }
  }, []);

  return { validate, validationResult, validating };
}
