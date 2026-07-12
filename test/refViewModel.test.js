var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var refTypes = require('../config/refTypes');

// refViewModel.js is a browser script with no module.exports, so evaluate it
// in a vm sandbox with just enough Knockout stubbed out for the constructor
// and computeds to work.
function loadRefViewModel() {
    var context = {
        ko: {
            observable: function (initial) {
                var value = initial;
                return function () {
                    if (arguments.length) { value = arguments[0]; }
                    return value;
                };
            },
            pureComputed: function (fn, owner) {
                return function () { return fn.call(owner); };
            },
            utils: {
                extend: function (target, source) {
                    for (var key in source) { target[key] = source[key]; }
                    return target;
                }
            },
            toJS: function (obj) { return obj; }
        },
        htmlDecode: function (value) { return value; }
    };
    vm.createContext(context);
    var src = fs.readFileSync(path.join(__dirname, '..', 'public', 'javascripts', 'refViewModel.js'), 'utf8');
    vm.runInContext(src, context);
    return context.RefViewModel;
}

describe('RefViewModel (#169)', function () {
    var RefViewModel = loadRefViewModel();

    describe('isReview', function () {
        it('is true for the canonical review value from config/refTypes', function () {
            var reviewType = refTypes.filter(function (t) { return t.label === 'Reviews'; })[0];
            expect(reviewType, 'a Reviews entry in config/refTypes').to.exist;
            var model = new RefViewModel({ type: reviewType.value });
            expect(model.isReview()).to.equal(true);
        });

        it('is false for every other configured type', function () {
            refTypes.filter(function (t) { return t.label !== 'Reviews'; }).forEach(function (t) {
                var model = new RefViewModel({ type: t.value });
                expect(model.isReview(), 'type=' + t.value).to.equal(false);
            });
        });

        it('is false when type is missing', function () {
            var model = new RefViewModel({});
            expect(model.isReview()).to.equal(false);
        });

        it('tracks type changes on an existing model', function () {
            var model = new RefViewModel({ type: 'technical' });
            expect(model.isReview()).to.equal(false);
            model.type('review');
            expect(model.isReview()).to.equal(true);
        });
    });
});
