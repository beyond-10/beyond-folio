import { placeholder } from '@beyondfolio/shared-dynamo';

export const handler = async () => {
  return { statusCode: 200, body: JSON.stringify(placeholder) };
};
