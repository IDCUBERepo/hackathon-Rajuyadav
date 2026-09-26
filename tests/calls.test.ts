import { describe, expect, it } from 'vitest';
import { HINDI_NUMBERS, TRADITIONAL_CALLS } from '../src/data/calls';
import { numberAnnouncement } from '../src/announce';

describe('call data', () => {
  it('has a traditional call and a Hindi word for every number 1-90', () => {
    expect(TRADITIONAL_CALLS).toHaveLength(91);
    expect(HINDI_NUMBERS).toHaveLength(91);
    for (let n = 1; n <= 90; n++) {
      expect(TRADITIONAL_CALLS[n].length).toBeGreaterThan(0);
      expect(HINDI_NUMBERS[n].length).toBeGreaterThan(0);
    }
  });
});

describe('numberAnnouncement', () => {
  it('reads two-digit numbers digit by digit', () => {
    expect(numberAnnouncement(22, 'plain', 'en')).toBe('Number 22 … 2, 2');
  });

  it('reads single digits simply', () => {
    expect(numberAnnouncement(5, 'plain', 'en')).toBe('Number 5 … only 5');
  });

  it('uses traditional calls when chosen', () => {
    expect(numberAnnouncement(22, 'traditional', 'en')).toBe('Two little ducks … 22');
  });

  it('speaks Hindi number words', () => {
    expect(numberAnnouncement(22, 'plain', 'hi')).toBe('नंबर बाईस … दो, दो');
    expect(numberAnnouncement(7, 'traditional', 'hi')).toBe('नंबर सात');
  });
});
