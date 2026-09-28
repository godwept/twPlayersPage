import { describe, expect, it } from 'vitest';
import { matchPhotoFilename, parsePhotoFilename } from '../../src/shared/photo-filename';

const roster = [
  { id: 'old-4', firstName: 'Mickaël', lastName: 'Chapdelaine', jerseyNumber: '4' },
  { id: 'new-4', firstName: 'Mickaël', lastName: 'Chapdelaine', jerseyNumber: '4' },
  { id: 'montoya-1', firstName: 'Alexandro', lastName: 'Montoya', jerseyNumber: '1' },
  { id: 'griffin-14', firstName: 'Carson', lastName: 'Griffin', jerseyNumber: '14' },
  { id: 'griffin-19', firstName: 'Cam', lastName: 'Griffin', jerseyNumber: '19' },
];

describe('photo filename matching', () => {
  it('parses the existing jersey, surname and sequence convention', () => {
    expect(parsePhotoFilename('1 - Montoya1.jpg')).toEqual({ jerseyNumber: '1', surname: 'Montoya', sequence: '1' });
  });

  it('returns unresolved states instead of guessing on unknown or reused numbers', () => {
    expect(matchPhotoFilename('4 - Chapdelaine2.jpg', roster)).toEqual({ status: 'ambiguous', playerIds: ['new-4', 'old-4'] });
    expect(matchPhotoFilename('8 - Unknown1.jpg', roster)).toEqual({ status: 'unmatched' });
    expect(matchPhotoFilename('not-a-photo.jpg', roster)).toEqual({ status: 'invalid' });
    expect(matchPhotoFilename('1 - Montoya1.jpg', roster)).toEqual({ status: 'matched', playerId: 'montoya-1' });
  });

  it('matches the actual full-name filenames in the supplied collection', () => {
    expect(matchPhotoFilename('14 - Carson Griffin142.jpg', roster)).toEqual({ status: 'matched', playerId: 'griffin-14' });
    expect(matchPhotoFilename('19 - Cam Griffin105.jpg', roster)).toEqual({ status: 'matched', playerId: 'griffin-19' });
  });
});
