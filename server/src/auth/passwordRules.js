import { z } from 'zod';

/**
 * Password rules (shared by sign-up, reset and change):
 * at least 8 characters, not only whitespace, not a commonly used password.
 * The list covers the most common passwords from public breach corpora,
 * plus obvious SarthiAI-specific choices.
 */
const COMMON = new Set(`password password1 password12 password123 password1234 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890
12341234 11111111 00000000 88888888 87654321 12121212 qwertyui qwerty123 qwertyuiop 1q2w3e4r 1q2w3e4r5t 1qaz2wsx zaq12wsx
asdfghjk asdfghjkl iloveyou iloveyou1 sunshine princess football baseball welcome welcome1 welcome123 letmein1 trustno1
abcd1234 abcdefgh admin123 administrator changeme changeme1 superman batman123 starwars computer internet whatever
monkey123 dragon123 master123 shadow123 michael1 jennifer charlie1 freedom1 secret123 india123 india@123 bharat123
sachin123 krishna123 ganesh123 jaishreeram hanuman123 mumbai123 delhi123 pakistan cricket1 cricket123 sarthi123 sarthiai
sarthiai1 sarthiai123 student1 student123 college123 engineer engineering 9876543210 0987654321 qwer1234 asdf1234 zxcvbnm1
zxcvbnm123 aa123456 a1234567 a12345678 abc12345 abc123456 test1234 testtest guest123 login123 hello123 helloworld`.split(/\s+/).filter(Boolean));

export const isCommonPassword = (p) => COMMON.has(String(p).trim().toLowerCase());

export const passwordSchema = z.string()
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => p.length >= 8, 'Password must be at least 8 characters')
  .refine((p) => p.trim().length > 0, 'Password cannot be only spaces')
  .refine((p) => !isCommonPassword(p), 'This password is too common. Choose something harder to guess.');
