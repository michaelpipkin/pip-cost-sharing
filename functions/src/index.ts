import * as functions from 'firebase-functions';
import { getHCaptchaSecret } from './common';

exports.validateHCaptcha = functions.https.onCall(async (request) => {
  const secret = await getHCaptchaSecret();
  const token = request.data.token;
  const formData = new FormData();
  formData.append('secret', secret!);
  formData.append('response', token);

  try {
    const res = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      body: formData,
      redirect: 'follow',
    });

    const data = await res.json();
    if (data.success) {
      return 'Success';
    } else {
      return 'Failed';
    }
  } catch (error) {
    console.error('Error validating hCaptcha:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Error validating hCaptcha'
    );
  }
});
