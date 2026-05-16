var expect = require('chai').expect;
var citations = require('../public/javascripts/citations');
var _i = citations._internals;

describe('Citation pipeline (#144)', function () {

    describe('inferType', function () {
        it('returns "book" when type=book', function () {
            expect(_i.inferType({ type: 'book' })).to.equal('book');
        });

        it('returns "review" when type=review', function () {
            expect(_i.inferType({ type: 'review' })).to.equal('review');
        });

        it('returns "review" when rev_* fields are populated even if type is blank', function () {
            expect(_i.inferType({ rev_title: 'Some other work' })).to.equal('review');
        });

        it('returns "proceedings" when reference mentions conference/proceedings AND has vol/issue shape', function () {
            expect(_i.inferType({
                type: 'technical',
                reference: 'Proceedings of the 8th ICC, Vol. 2'
            })).to.equal('proceedings');
        });

        it('returns "journal" for technical refs with periodical shape', function () {
            expect(_i.inferType({
                type: 'technical',
                reference: 'Journal of Creation, Vol. 35, No. 2'
            })).to.equal('journal');
        });

        it('returns "periodical" for non-technical refs with periodical shape', function () {
            expect(_i.inferType({
                type: 'popular',
                reference: 'Creation Magazine, Vol. 40, No. 1'
            })).to.equal('periodical');
        });

        it('falls back to "website" when reference has no periodical hints', function () {
            expect(_i.inferType({
                type: 'media',
                reference: 'creationeducation.org/post/123'
            })).to.equal('website');
        });

        it('detects # as an issue marker', function () {
            expect(_i.inferType({
                type: 'popular',
                reference: 'CRSQ #2'
            })).to.equal('periodical');
        });
    });

    describe('parseVolumeIssue', function () {
        it('extracts Vol. and No. with periods', function () {
            var r = _i.parseVolumeIssue('Journal of Creation, Vol. 35, No. 2');
            expect(r.volume).to.equal('35');
            expect(r.issue).to.equal('2');
            expect(r.cleanedReference).to.equal('Journal of Creation');
        });

        it('extracts Volume / Number spelled out', function () {
            var r = _i.parseVolumeIssue('CRSQ Volume 12 Number 4');
            expect(r.volume).to.equal('12');
            expect(r.issue).to.equal('4');
        });

        it('extracts the combined Vol N(M) shape in one pass', function () {
            var r = _i.parseVolumeIssue('Origins Vol. 3(2)');
            expect(r.volume).to.equal('3');
            expect(r.issue).to.equal('2');
            expect(r.cleanedReference).to.equal('Origins');
        });

        it('extracts # as an issue marker', function () {
            var r = _i.parseVolumeIssue('CRSQ Vol 40 #3');
            expect(r.volume).to.equal('40');
            expect(r.issue).to.equal('3');
        });

        it('converts roman numerals to arabic', function () {
            var r = _i.parseVolumeIssue('Old Series Vol. IV, No. III');
            expect(r.volume).to.equal('4');
            expect(r.issue).to.equal('3');
        });

        it('leaves the reference untouched when no vol/issue is present', function () {
            var r = _i.parseVolumeIssue('Nature 391:33');
            expect(r.volume).to.be.null;
            expect(r.issue).to.be.null;
            expect(r.cleanedReference).to.equal('Nature 391:33');
        });
    });

    describe('stripParentheticals', function () {
        it('removes (paper), (perspective), etc.', function () {
            expect(_i.stripParentheticals('Foo Journal (paper)')).to.equal('Foo Journal');
        });

        it('collapses multiple parentheticals', function () {
            expect(_i.stripParentheticals('Foo (a) Bar (b) Baz')).to.equal('Foo Bar Baz');
        });

        it('handles missing/empty input', function () {
            expect(_i.stripParentheticals('')).to.equal('');
            expect(_i.stripParentheticals(null)).to.equal('');
        });
    });

    describe('stripPagePrefix', function () {
        it('strips a leading "p"', function () {
            expect(_i.stripPagePrefix('p 12')).to.equal('12');
        });

        it('strips a leading "pp."', function () {
            expect(_i.stripPagePrefix('pp. 12-20')).to.equal('12-20');
        });

        it('leaves clean page numbers alone', function () {
            expect(_i.stripPagePrefix('34')).to.equal('34');
        });

        it('strips uppercase "PP."', function () {
            expect(_i.stripPagePrefix('PP. 5')).to.equal('5');
        });
    });

    describe('parseAuthors', function () {
        it('returns "Unknown" for empty input', function () {
            var out = _i.parseAuthors('');
            expect(out).to.deep.equal([{ last: 'Unknown', initials: '', full: 'Unknown' }]);
        });

        it('parses a single LastName, F. M. author', function () {
            var out = _i.parseAuthors('Smith, J. M.');
            expect(out.length).to.equal(1);
            expect(out[0].last).to.equal('Smith');
            expect(out[0].initials).to.equal('J. M.');
        });

        it('splits multiple authors on " and "', function () {
            var out = _i.parseAuthors('Smith, J. M. and Jones, R. T.');
            expect(out.length).to.equal(2);
            expect(out[0].last).to.equal('Smith');
            expect(out[1].last).to.equal('Jones');
        });

        it('splits on " & "', function () {
            var out = _i.parseAuthors('Smith, J. & Jones, R.');
            expect(out.length).to.equal(2);
        });

        it('does not split "Smith, J. M." into two authors', function () {
            var out = _i.parseAuthors('Smith, J. M.');
            expect(out.length).to.equal(1);
        });

        it('drops (ed.) parentheticals before splitting', function () {
            var out = _i.parseAuthors('Smith, J. (ed.)');
            expect(out.length).to.equal(1);
            expect(out[0].last).to.equal('Smith');
        });
    });

    describe('romanToArabic', function () {
        it('converts simple roman numerals', function () {
            expect(_i.romanToArabic('IV')).to.equal('4');
            expect(_i.romanToArabic('IX')).to.equal('9');
            expect(_i.romanToArabic('XL')).to.equal('40');
            expect(_i.romanToArabic('MCMXCIV')).to.equal('1994');
        });

        it('is case-insensitive', function () {
            expect(_i.romanToArabic('iv')).to.equal('4');
        });

        it('returns null for non-roman input', function () {
            expect(_i.romanToArabic('42')).to.be.null;
            expect(_i.romanToArabic('foo')).to.be.null;
        });
    });

    describe('joinNonEmpty', function () {
        it('skips empty strings, null, and undefined', function () {
            expect(_i.joinNonEmpty(['a', '', 'b', null, 'c', undefined], '. ')).to.equal('a. b. c');
        });

        it('returns "" when all parts are empty', function () {
            expect(_i.joinNonEmpty(['', null, undefined], '. ')).to.equal('');
        });
    });

    describe('formatAuthorsList', function () {
        it('renders a single author', function () {
            var out = _i.formatAuthorsList([{ last: 'Smith', initials: 'J. M.', full: 'J. M. Smith' }]);
            expect(out).to.equal('Smith, J. M.');
        });

        it('renders two authors with "and"', function () {
            var out = _i.formatAuthorsList(_i.parseAuthors('Smith, J. M. and Jones, R. T.'));
            expect(out).to.equal('Smith, J. M. and R. T. Jones');
        });

        it('renders three+ authors with Oxford comma + "and"', function () {
            var out = _i.formatAuthorsList(_i.parseAuthors('Smith, J. and Jones, R. and Brown, K.'));
            // First inverted, rest natural, Oxford comma before final "and".
            expect(out).to.equal('Smith, J., R. Jones, and K. Brown');
        });

        it('renders Unknown when input was blank', function () {
            expect(_i.formatAuthorsList(_i.parseAuthors(''))).to.equal('Unknown');
        });
    });

    describe('format() — end-to-end style smoke tests', function () {
        var bookRef = {
            type: 'book',
            author: 'Smith, J. M.',
            title: 'The Origin Question',
            year: '2010',
            publisher: 'Master Books'
        };

        var journalRef = {
            type: 'technical',
            author: 'Smith, J. M. and Jones, R. T.',
            title: 'A Study',
            year: '2020',
            reference: 'Journal of Creation, Vol. 34, No. 2',
            page: 'pp. 12-20'
        };

        it('book CRSQ does not show ":Page"', function () {
            var html = citations.format('crsq', bookRef);
            expect(html).to.not.match(/:/);
            expect(html).to.contain('Master Books');
        });

        it('journal CRSQ does not include "Vol. 34" in the italic reference text', function () {
            var html = citations.format('crsq', journalRef);
            // The cleaned reference name appears, the Vol/No labels do not.
            expect(html).to.contain('<i>Journal of Creation</i>');
            expect(html).to.not.match(/Vol\.\s*34/);
        });

        it('journal CRSQ shows vol(issue) suffix and the stripped page', function () {
            var html = citations.format('crsq', journalRef);
            expect(html).to.contain('34(2)');
            expect(html).to.contain('12-20');
            expect(html).to.not.contain('pp. 12-20'); // prefix stripped
        });

        it('does not emit trailing punctuation around empty fields', function () {
            var html = citations.format('apa', { type: 'book', author: 'Smith, J.', title: 'A Book' });
            // No "(). " from missing year, no double periods.
            expect(html).to.not.match(/\(\)/);
            expect(html).to.not.match(/\.\s*\./);
        });

        it('returns "" for an unknown style id', function () {
            expect(citations.format('nope', journalRef)).to.equal('');
        });
    });
});
