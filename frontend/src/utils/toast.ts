import { Toast } from '@douyinfe/semi-ui';

let toastId: string | undefined;

function closePrevious() {
  if (toastId) {
    Toast.close(toastId);
    toastId = undefined;
  }
}

export function showToast(message: string, type: 'error' | 'success' | 'warning' | 'info' = 'info') {
  closePrevious();
  toastId = Toast[type]({ content: message, duration: 3 });
}

export function showError(message: string) {
  showToast(message, 'error');
}

export function showSuccess(message: string) {
  showToast(message, 'success');
}

export function showWarning(message: string) {
  showToast(message, 'warning');
}
