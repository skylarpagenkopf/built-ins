module.exports = Component;
var Class = require('chip-utils/class');
var lifecycle = [ 'created', 'bound', 'attached', 'unbound', 'detached' ];


function Component(element, contentTemplate) {
  this.element = element;

  if (this.template) {
    this._view = this.template.createView();
    if (contentTemplate) {
      this.element._componentContent = contentTemplate;
    }
  } else if (contentTemplate) {
    this._view = contentTemplate.createView();
  }

  if (this._view) {
    this.element.appendChild(this._view);
  }

  this.created();
}

Component.onExtend = function(Class, mixins) {
  Class.prototype.mixins = Class.prototype.mixins.concat(mixins);

  // They will get called via mixins, don't let them override the original methods. To truely override you can define
  // them after using Class.extend on a component.
  lifecycle.forEach(function(method) {
    delete Class.prototype[method];
  });
};

Class.extend(Component, {
  mixins: [],

  get view() {
    return this._view;
  },

  created: function() {
    callOnMixins(this, this.mixins, 'created', arguments);
  },

  bound: function() {
    callOnMixins(this, this.mixins, 'bound', arguments);
    this._view.bind(this);
  },

  attached: function() {
    callOnMixins(this, this.mixins, 'attached', arguments);
    this._view.attached();
  },

  unbound: function() {
    callOnMixins(this, this.mixins, 'unbound', arguments);
    this._view.unbind();
  },

  detached: function() {
    callOnMixins(this, this.mixins, 'detached', arguments);
    this._view.detached();
  }

});


// Calls the method by name on any mixins that have it defined
function callOnMixins(context, mixins, name, args) {
  mixins.forEach(function(mixin) {
    if (typeof mixin[name] === 'function') mixin[name].apply(context, args);
  });
}