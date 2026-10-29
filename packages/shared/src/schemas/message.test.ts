import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX_RECIPIENTS,
  mergeFieldsFor,
  messageAudienceRequestSchema,
  messageInputSchema,
  renderTemplate,
  templateTokens,
} from './message';

describe('message merge fields', () => {
  it('lists the tokens used in a template once, in order', () => {
    expect(templateTokens('Dear {{ first_name }}, your {{client_code}} / {{first_name}}')).toEqual([
      'first_name',
      'client_code',
    ]);
  });

  it('fills tokens from the recipient values', () => {
    const rendered = renderTemplate('Dear {{first_name}} of {{branch}},', {
      first_name: 'Ama',
      branch: 'Head Office',
    });
    expect(rendered).toBe('Dear Ama of Head Office,');
  });

  it('renders a token with no value as an empty string', () => {
    expect(renderTemplate('Hello {{contact_person}}!', { contact_person: null })).toBe('Hello !');
  });

  it('leaves a token it does not know untouched', () => {
    expect(renderTemplate('Hello {{nope}}', { first_name: 'Ama' })).toBe('Hello {{nope}}');
  });

  it('offers audience-specific fields alongside the common ones', () => {
    const clientTokens = mergeFieldsFor('clients').map((f) => f.token);
    expect(clientTokens).toContain('client_code');
    expect(clientTokens).toContain('company_name');
    expect(mergeFieldsFor('users').map((f) => f.token)).not.toContain('client_code');
  });
});

describe('message input validation', () => {
  const valid = {
    audience: 'clients' as const,
    subject: 'Price list update',
    body: 'Dear {{first_name}}, our new price list is attached.',
  };

  it('accepts a message whose tokens the audience can fill', () => {
    const result = messageInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filters).toEqual({});
  });

  it('rejects a merge field the audience cannot fill', () => {
    const result = messageInputSchema.safeParse({
      ...valid,
      audience: 'users',
      body: 'Hello {{client_code}}',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['body']);
      expect(result.error.issues[0]?.message).toContain('{{client_code}}');
    }
  });

  it('rejects an unknown token in the subject', () => {
    const result = messageInputSchema.safeParse({ ...valid, subject: 'Hi {{nickname}}' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['subject']);
  });

  it('requires a subject and a message', () => {
    const result = messageInputSchema.safeParse({ audience: 'clients', subject: '  ', body: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual(['body', 'subject']);
    }
  });

  it('caps an explicit recipient list at the send limit', () => {
    const ids = Array.from({ length: MESSAGE_MAX_RECIPIENTS + 1 }, () => crypto.randomUUID());
    expect(messageInputSchema.safeParse({ ...valid, recipientIds: ids }).success).toBe(false);
  });

  it('lets the audience request omit the text while counting recipients', () => {
    const result = messageAudienceRequestSchema.safeParse({ audience: 'branch_managers' });
    expect(result.success).toBe(true);
  });

  it('still rejects bad tokens when only the body is supplied', () => {
    const result = messageAudienceRequestSchema.safeParse({
      audience: 'branch_managers',
      body: 'Hello {{username}}',
    });
    expect(result.success).toBe(false);
  });
});
