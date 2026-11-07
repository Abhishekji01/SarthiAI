import { test, expect } from '@playwright/test';
import { signedInStudent } from './helpers';

test.describe('H3: onboarding validation and sticky footer', () => {
  test('an invalid CGPA is blocked on step 2 with an inline error', async ({ page, request }) => {
    await signedInStudent(page, request, { onboarded: false });
    await page.goto('/onboarding');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Degree').selectOption('B.Tech');
    await page.getByLabel('Current year of study').selectOption('2');
    const cgpa = page.getByLabel('CGPA (optional, out of 10)');
    await cgpa.fill('15');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Your course' })).toBeVisible();
    await expect(page.getByText('CGPA must be between 0 and 10')).toBeVisible();
    await expect(cgpa).toBeFocused();
    await expect(cgpa).toHaveAttribute('aria-invalid', 'true');
    // The error is not hidden behind the sticky footer.
    const covered = await page.getByText('CGPA must be between 0 and 10').evaluate((el) => {
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.x + 4, b.y + b.height / 2) !== el;
    });
    expect(covered).toBe(false);
    await cgpa.fill('8.4');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Skills & goals' })).toBeVisible();
  });

  test('the Career goal input is not covered by the sticky footer', async ({ page, request }) => {
    await signedInStudent(page, request, { onboarded: false, profile: {
      degree: 'B.Tech', currentYear: 2,
      skills: ['Python', 'Java', 'C++', 'JavaScript', 'React', 'Node.js', 'SQL', 'Git', 'Linux', 'Networking'],
      interests: ['AI/ML', 'Hackathons', 'Research', 'Startups', 'Open Source'],
    } });
    await page.goto('/onboarding');
    for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Continue' }).click();
    const goal = page.getByLabel('Career goal');
    for (const how of ['focus', 'scrollIntoView'] as const) {
      await page.evaluate(() => window.scrollTo(0, 0));
      if (how === 'focus') await goal.focus();
      else await goal.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      const onTop = await goal.evaluate((el) => {
        const b = el.getBoundingClientRect();
        return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el;
      });
      expect(onTop, `${how}: Career goal should be the element at its own centre`).toBe(true);
    }
  });
});
