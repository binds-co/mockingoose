const mongoose = require('mongoose');

if(!/^5/.test(mongoose.version)) mongoose.Promise = Promise;

mongoose.connect = jest.fn().mockImplementation(() => Promise.resolve());
mongoose.createConnection = jest
  .fn()
  .mockReturnValue({
    on: jest.fn(),
    once: jest.fn(),
    then(resolve) { return Promise.resolve(resolve(this)); },
    catch() {},
    model: mongoose.model.bind(mongoose),
  });

const ops = [
  'find',
  'findOne',
  'count',
  'distinct',
  'findOneAndUpdate',
  'findOneAndRemove',
  'remove',
  'update',
  'deleteOne',
  'deleteMany',
];

const mockedReturn = function (cb) {
  const { op, model: { modelName }, _mongooseOptions = {} } = this;
  const Model = mongoose.model(modelName);

  let mock = mockingoose.__mocks[modelName] && mockingoose.__mocks[modelName][op];
  let mockingOptions = mockingoose.__mocksOptions[modelName] || {};

  if (!mockingOptions.hasOwnProperty(op)) {
    mockingOptions[op] = {
      instantiateModel: true,
      forceLean: false
    }
  }                          

  if (!mockingOptions[op].hasOwnProperty('instantiateModel')) {
    mockingOptions[op].instantiateModel = true
  }

  if (!mockingOptions[op].hasOwnProperty('forceLean')) {
    mockingOptions[op].forceLean = false
  }

  let err = null;

  if (mock instanceof Error) err = mock;

  if (!mock && op === 'save') { mock = this;}

  if (
    mock && 
    mock instanceof Model === false &&
    (!['update', 'count'].includes(op))
    && mockingOptions[op].instantiateModel
  ) {
    mock = Array.isArray(mock) ? mock.map(item => new Model(item)) : new Model(mock);

    if (_mongooseOptions.lean || mockingOptions[op].forceLean) mock = Array.isArray(mock) ? mock.map(item => item.toObject()) : mock.toObject();
  }

  if (cb) return cb(err, mock);

  if (err) return Promise.reject(err);

  return Promise.resolve(mock);
};

ops.forEach(op => {
  mongoose.Query.prototype[op] = jest.fn().mockImplementation(function (criteria, doc, options, callback) {
    switch (arguments.length) {
      case 4:
      case 3:
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        break;
      case 2:
        if (typeof doc === 'function') {
          callback = doc;
          doc = criteria;
          criteria = undefined;
        }
        options = undefined;
        break;
      case 1:
        if (typeof criteria === 'function') {
          callback = criteria;
          criteria = options = doc = undefined;
        } else {
          doc = criteria;
          criteria = options = undefined;
        }
    }

    this.op = op;

    if (!callback) return this;

    return this.exec.call(this, callback);
  });
});

mongoose.Query.prototype.exec = jest.fn().mockImplementation(function cb(cb) {
  return mockedReturn.call(this, cb);
});

mongoose.Aggregate.prototype.exec = jest.fn().mockImplementation(function cb(cb) {
	const { _model: { modelName } } = this;

	let mock = mockingoose.__mocks[modelName] && mockingoose.__mocks[modelName].aggregate;

	let err = null;

	if (mock instanceof Error) err = mock;

	if (cb) return cb(err, mock);

	if (err) return Promise.reject(err);

	return Promise.resolve(mock);
});

const instance = [
  'remove',
  'save'
];

instance.forEach(methodName => {
  mongoose.Model.prototype[methodName] = jest.fn().mockImplementation(function (options, cb) {
    const op = methodName;
    const { modelName } = this.constructor;

    if (typeof options === 'function') cb = options;

    Object.assign(this, { op, model: { modelName } });

    return mockedReturn.call(this, cb);
  })
});

jest.doMock('mongoose', () => mongoose);

const target = {
  __mocks: {},
  __mocksOptions: {},
  resetAll() { this.__mocks = {}; },
  toJSON() { return this.__mocks; },
};

const traps = {
  get(target, prop) {
    if (target.hasOwnProperty(prop)) return Reflect.get(target, prop);

    return {
      toReturn(o, op = 'find', opt = { }) {
        if (target.__mocks.hasOwnProperty(prop)) {
          target.__mocks[prop][op] = o
        } else {
          target.__mocks[prop] = { [op]: o }
        }

        if (!opt.hasOwnProperty('instantiateModel')) {
          opt.instantiateModel = true
        }

        if (!opt.hasOwnProperty('forceLean')) {
          opt.forceLean = false
        }

        if (target.__mocksOptions.hasOwnProperty(prop)) {
          target.__mocksOptions[prop][op] = opt
        } else {
          target.__mocksOptions[prop] = { [op]: opt }
        }

        return this;
      },

      reset(op) {
        op && delete target.__mocks[prop][op] || delete target.__mocks[prop];
        op && delete target.__mocksOptions[prop];

        return this;
      },

      toJSON() {
        return target.__mocks[prop] || {};
      },
    };
  },
};

const mockingoose = new Proxy(target, traps);

module.exports = mockingoose;
