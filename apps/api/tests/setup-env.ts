process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SUPABASE_URL ??= 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_JWT_SECRET ??= 'test-jwt-secret-with-enough-length-1234567890';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
