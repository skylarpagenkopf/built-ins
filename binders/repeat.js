var diff = require('differences-js');

/**
 * A binder that duplicate an element for each item in an array. The expression may be of the format `epxr` or
 * `itemName in expr` where `itemName` is the name each item inside the array will be referenced by within bindings
 * inside the element.
 */
module.exports = function(compareByAttribute) {
  return {
    animated: true,
    priority: 100,

    compiled: function() {
      if (this.element.hasAttribute(compareByAttribute)) {
        this.compareBy = this.fragments.codifyExpression('attribute', this.element.getAttribute(compareByAttribute), true);
        this.element.removeAttribute(compareByAttribute);
      }
      var parent = this.element.parentNode;
      var placeholder = document.createTextNode('');
      parent.insertBefore(placeholder, this.element);
      this.template = this.fragments.createTemplate(this.element);
      this.element = placeholder;


      var parts = this.expression.split(/\s+in\s+|\s+of\s+/);
      this.expression = parts.pop();
      var key = parts.pop();
      if (key) {
        parts = key.split(/\s*,\s*/);
        this.valueName = parts.pop();
        this.keyName = parts.pop();
      }
    },

    created: function() {
      this.views = [];
      this.observer.getChangeRecords = true;
      this.observer.compareBy = this.compareBy;
      this.observer.compareByName = this.valueName;
      this.observer.compareByIndex = this.keyName;
    },

    attached: function() {
      this.views.forEach(function(view) {
        view.attached();
      });
    },

    detached: function() {
      this.views.forEach(function(view) {
        view.detached();
      });
    },

    removeView: function(view) {
      view.dispose();
      view._repeatItem_ = null;
    },

    updated: function(value, oldValue, changes) {
      if (!changes || !this.context) {
        this.populate(value);
      } else {
        if (this.animate) {
          this.updateChangesAnimated(value, changes);
        } else {
          this.updateChanges(value, changes);
          this.updateViewContexts(value);
        }
      }
    },

    updateViewContexts: function(value) {
      // Keep the items updated as the array changes
      if (this.valueName) {
        this.views.forEach(function(view, i) {
          if (view.context) {
            if (this.keyName) view.context[this.keyName] = i;
            view.context[this.valueName] = value[i];
          }
        }, this);
      }
    },

    // Method for creating and setting up new views for our list
    createView: function(key, value) {
      var view = this.template.createView(this.element.ownerDocument);
      var context = value;
      if (this.valueName) {
        context = Object.create(this.context);
        if (this.keyName) context[this.keyName] = key;
        context[this.valueName] = value;
        context._origContext_ = this.context.hasOwnProperty('_origContext_')
          ? this.context._origContext_
          : this.context;
      }
      view.bind(context);
      view._repeatItem_ = value;
      return view;
    },

    populate: function(value) {
      if (this.animating) {
        this.valueWhileAnimating = value;
        return;
      }

      if (this.views.length) {
        this.views.forEach(this.removeView);
        this.views.length = 0;
      }

      if (Array.isArray(value) && value.length) {
        var frag = document.createDocumentFragment();

        value.forEach(function(item, index) {
          var view = this.createView(index, item);
          this.views.push(view);
          frag.appendChild(view);
        }, this);

        this.element.parentNode.insertBefore(frag, this.element.nextSibling);
        if (this.view.inDOM) this.attached();
      }
    },

    /**
     * This un-animated version removes all removed views first so they can be returned to the pool and then adds new
     * views back in. This is the most optimal method when not animating.
     */
    updateChanges: function(value, changes) {
      // Remove everything first, then add again, allowing for element reuse from the pool
      var addedCount = 0;

      changes.forEach(function(splice) {
        if (splice.removed.length) {
          var removed = this.views.splice(splice.index - addedCount, splice.removed.length);
          removed.forEach(this.removeView);
        }
        addedCount += splice.addedCount;
      }, this);

      // Add the new/moved views
      changes.forEach(function(splice) {
        if (!splice.addedCount) return;
        var addedViews = [];
        var fragment = document.createDocumentFragment();
        var index = splice.index;
        var endIndex = index + splice.addedCount;

        for (var i = index; i < endIndex; i++) {
          var item = value[i];
          var view = this.createView(i, item);
          addedViews.push(view);
          fragment.appendChild(view);
        }
        this.views.splice.apply(this.views, [ index, 0 ].concat(addedViews));
        var previousView = this.views[index - 1];
        var nextSibling = previousView ? previousView.lastViewNode.nextSibling : this.element.nextSibling;
        this.element.parentNode.insertBefore(fragment, nextSibling);
        if (this.view.inDOM) this.attached();
      }, this);
    },

    /**
     * This animated version must animate removed nodes out while added nodes are animating in making it less optimal
     * (but cool looking). It also handles "move" animations for nodes which are moving place within the list.
     */
    updateChangesAnimated: function(value, changes) {
      if (this.animating) {
        this.valueWhileAnimating = value;
        return;
      }
      var animatingValue = value.slice();
      var allAdded = [];
      var allRemoved = [];
      var doneCount = 0;
      this.animating = true;

      // Run updates which occured while this was animating.
      var whenDone = function() {
        // The last animation finished will run this
        if (--doneCount !== 0) return;

        allRemoved.forEach(this.removeView);

        if (this.animating) {
          this.animating = false;
          if (this.valueWhileAnimating) {
            var changes = diff.arrays(this.valueWhileAnimating, animatingValue);
            if (changes.length) {
              var value = this.valueWhileAnimating;
              this.valueWhileAnimating = null;
              this.updateChangesAnimated(value, changes);
            }
          }
        }
      };

      changes.forEach(function(splice) {
        var addedViews = [];
        var fragment = document.createDocumentFragment();
        var index = splice.index;
        var endIndex = index + splice.addedCount;
        var removedCount = splice.removed.length;

        for (var i = index; i < endIndex; i++) {
          var item = value[i];
          var view = this.createView(i, item);
          addedViews.push(view);
          fragment.appendChild(view);
        }

        var removedViews = this.views.splice.apply(this.views, [ index, removedCount ].concat(addedViews));
        var previousView = this.views[index - 1];
        var nextSibling = previousView ? previousView.lastViewNode.nextSibling : this.element.nextSibling;
        this.element.parentNode.insertBefore(fragment, nextSibling);
        if (this.view.inDOM) this.attached();

        allAdded = allAdded.concat(addedViews);
        allRemoved = allRemoved.concat(removedViews);
      }, this);


      allAdded.forEach(function(view) {
        doneCount++;
        this.animateIn(view, whenDone);
      }, this);

      allRemoved.forEach(function(view) {
        doneCount++;
        view.unbind();
        this.animateOut(view, whenDone);
      }, this);

      this.updateViewContexts(value);
    },

    unbound: function() {
      this.views.forEach(function(view) {
        view.unbind();
        view._repeatItem_ = null;
      });
      this.valueWhileAnimating = null;
      this.animating = false;
    }
  };
};
