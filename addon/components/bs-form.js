import Component from '@glimmer/component';
import { action, set } from '@ember/object';
import { assert } from '@ember/debug';
import { isPresent } from '@ember/utils';
import { next } from '@ember/runloop';
import RSVP from 'rsvp';
import { getOwnConfig, macroCondition } from '@embroider/macros';
import deprecateSubclassing from 'ember-bootstrap/utils/deprecate-subclassing';
import arg from '../utils/decorators/arg';
import { tracked } from '@glimmer/tracking';
import { cached } from 'tracked-toolbox';
import { ref } from 'ember-ref-bucket';

/**
  Render a form with the appropriate Bootstrap layout class (see `formLayout`).
  Allows setting a `model` that nested `Components.FormElement`s can access, and that can provide form validation (see below)

  You can use whatever markup you like within the form.
  However, to benefit from features such as automatic form markup, validations and validation markup, use `Components.FormElement`
  as nested components. See below for an example.

  ### Submitting the form

  The form yields a `submitButton` component, which is a preconfigured `<BsButton>` with `@type="primary"` and `@buttonType="submit"`.
  The button is disabled while a form submission is pending. Additionally, the button state is bound to the form submission state.

  ```hbs
  <BsForm as |form|>
    <form.submitButton>Submit</form.submitButton>
  </BsForm>
  ```

  When the form is submitted (e.g. by clicking the submit button), the event will be intercepted and the `onSubmit` action
  will be sent to the controller or parent component.
  In case the form supports validation (see "Form validation" below), the `onBefore` action is called (which allows you to
  do e.g. model data normalization), then the available validation rules are evaluated, and if those fail, the `onInvalid`
  action is sent instead of `onSubmit`.

  ### Use with Components.FormElement

  When using `Components.FormElement`s with their `property` set to property names of the form's validation enabled
  `model`, you gain some additional powerful features:
  * the appropriate Bootstrap markup for the given `formLayout` and the form element's `controlType` is automatically generated
  * markup for validation states and error messages is generated based on the model's validation (if available), when submitting the form
  with an invalid validation, or when focusing out of invalid inputs

  ```handlebars
  <BsForm @formLayout="horizontal" @model={{this}} @onSubmit={{action "submit"}} as |form|>
    <form.element @controlType="email" @label="Email" @placeholder="Email" @property="email" />
    <form.element @controlType="password" @label="Password" @placeholder="Password" @property="password" />
    <form.element @controlType="checkbox" @label="Remember me" @property="rememberMe" />
    <form.submitButton>Submit</form.submitButton>
  </BsForm>
  ```

  See the [Components.FormElement](Components.FormElement.html) API docs for further information.

  ### Form validation

  All version of ember-bootstrap beginning from 0.7.0 do not come with built-in support for validation engines anymore.
  Instead, support is added usually by additional Ember addons, for example:

  * [ember-bootstrap-validations](https://github.com/kaliber5/ember-bootstrap-validations): adds support for [ember-validations](https://github.com/DockYard/ember-validations)
  * [ember-bootstrap-cp-validations](https://github.com/offirgolan/ember-bootstrap-cp-validations): adds support for [ember-cp-validations](https://github.com/offirgolan/ember-cp-validations)
  * [ember-bootstrap-changeset-validations](https://github.com/kaliber5/ember-bootstrap-changeset-validations): adds support for [ember-changeset](https://github.com/poteto/ember-changeset)

  To add your own validation support, you have to:

  * extend this component, setting `hasValidator` to true if validations are available (by means of a computed property for example), and implementing the `validate` method
  * extend the [Components.FormElement](Components.FormElement.html) component and implement the `setupValidations` hook or simply override the `errors` property to add the validation error messages to be displayed

  When validation fails, the appropriate Bootstrap markup is added automatically, i.e. the error classes are applied and
  the validation messages are shown for each form element. In case the validation library supports it, also warning messages
  are shown. See the [Components.FormElement](Components.FormElement.html) documentation for further details.

  See the above-mentioned addons for examples.

  The `novalidate` HTML attribute is set by default for forms that have validation.

  ### Submission state

  A `isSubmitting` property is yielded, which is `true` after submit has been triggered and before the Promise returned
  by `onSubmit` is fulfilled. It could be used to show a loading spinner instead of the form while it's submitting for example:

  ```hbs
  <BsForm @onSubmit={{action "save"}} as |form|>
    {{#if form.isSubmitting}}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      Logging in...
    {{else}}
      <form.element @property="email" @label="email" />
      <form.element @property="password" @label="password" @controlType="password" />
      <form.submitButton>Login</form.submitButton>
    {{/if}}
  </BsForm>
  ```

  Additionaly `isSubmitted` and `isRejected` properties are yielded. `isSubmitted` is `true` if last submission was successful.
  `isRejected` is `true` if last submission was rejected due to validation errors or by an action bound to `onSubmit` event, returning a rejected promise.
  It could be used for visual feedback about last submission:

  ```hbs
  <BsForm @onSubmit={{action 'save}} as |form|>
    <form.submitButton @type={{if form.isRejected "danger" "primary"}}>
      Save
    </form.submitButton>
  </BsForm>
  ```

  The submission state is reset as soon as any value of a form element changes. Additionally, it can be reset programmatically by
  calling the yielded `resetSubmissionState` function.

  *Note that only invoking the component in a template as shown above is considered part of its public API. Extending from it (subclassing) is generally not supported, and may break at any time.*

  @class Form
  @namespace Components
  @extends Ember.Component
  @public
*/
@deprecateSubclassing
export default class Form extends Component {
  /**
   * @property _element
   * @type null | HTMLFormElement
   * @private
   */
  @ref('formElement') _element = null;

  /**
   * Bootstrap form class name (computed)
   *
   * @property layoutClass
   * @type string
   * @readonly
   * @protected
   *
   */
  get layoutClass() {
    let layout = this.formLayout;
    if (macroCondition(getOwnConfig().isBS4)) {
      return layout === 'inline' ? 'form-inline' : null;
    } else {
      return null;
    }
  }

  /**
   * Set a model that this form should represent. This serves several purposes:
   *
   * * child `Components.FormElement`s can access and bind to this model by their `property`
   * * when the model supports validation by using the [ember-validations](https://github.com/dockyard/ember-validations) mixin,
   * child `Components.FormElement`s will look at the validation information of their `property` and render their form group accordingly.
   * Moreover, the form's `submit` event handler will validate the model and deny submitting if the model is not validated successfully.
   *
   * `<BsForm>` yields the form's model as `form` property:
   *
   * ```hbs
   * <BsForm @model={{this.formModel}} as |form|>
   *   {{! this.formModel === form.model }}
   * </BsForm>
   * ```
   *
   * @property model
   * @type object
   * @public
   */
  @cached
  get model() {
    return this.args.model ?? {};
  }

  /**
   * Set the layout of the form to either "vertical", "horizontal" or "inline". See http://getbootstrap.com/css/#forms-inline and http://getbootstrap.com/css/#forms-horizontal
   *
   * @property formLayout
   * @type string
   * @public
   */
  @arg
  formLayout = 'vertical';

  /**
   * Check if validating the model is supported. This needs to be implemented by another addon.
   *
   * @property hasValidator
   * @type boolean
   * @readonly
   * @protected
   */

  /**
   * The Bootstrap grid classes for form labels. This is used by the `Components.FormElement` class as a default for the
   * whole form.
   *
   * @property horizontalLabelGridClass
   * @type string
   * @default 'col-md-4'
   * @public
   */
  @arg
  horizontalLabelGridClass = 'col-md-4';

  /**
   * @property elementComponent
   * @type {String}
   * @private
   */

  /**
   * @property submitButtonComponent
   * @type {String}
   * @private
   */

  /**
   * `isSubmitting` is `true` after `submit` event has been triggered and until Promise returned by `onSubmit` is
   * fulfilled. If `validate` returns a Promise that one is also taken into consideration.
   *
   * If multiple concurrent submit events are fired, it stays `true` until all submit events have been fulfilled.
   *
   * @property isSubmitting
   * @type {Boolean}
   * @readonly
   * @private
   */
  get isSubmitting() {
    return this.pendingSubmissions > 0;
  }

  /**
   * `isSubmitted` is `true` if last submission was successful.
   * A change to any form element resets its value to `false`.
   *
   * If not using `Components.FormElement`, `resetSubmissionState` action must be triggered on each change to reset
   * form's submission state.
   *
   * @property isSubmitted
   * @type {Boolean}
   * @private
   */
  @tracked
  isSubmitted = false;

  /**
   * `isRejected` is `true` if last submission was rejected.
   * A submission is considered as rejected if form is invalid as well as if `onSubmit` rejects.
   * A change to any form element resets its value to `false`.
   *
   * If not using `Components.FormElement`, `resetSubmissionState` action must be triggered on each change to reset
   * form's submission state.
   *
   * @property isRejected
   * @type {Boolean}
   * @private
   */
  @tracked
  isRejected = false;

  /**
   * State of the form expressed as state values expected by `<BsButton>`.
   *
   * @property submitButtonState
   * @type {String}
   * @private
   */
  get submitButtonState() {
    if (this.isSubmitting) {
      return 'pending';
    }

    if (this.isSubmitted) {
      return 'fulfilled';
    }

    if (this.isRejected) {
      return 'rejected';
    }

    return 'default';
  }

  /**
   * Count of pending submissions.
   *
   * @property pendingSubmissions
   * @type {Integer}
   * @private
   */
  @tracked
  pendingSubmissions = 0;

  /**
   * If set to true pressing enter will submit the form, even if no submit button is present
   *
   * @property submitOnEnter
   * @type boolean
   * @default false
   * @public
   */

  /**
   * Controls if `onSubmit` action is fired concurrently. If `true` submitting form multiple
   * times will not trigger `onSubmit` action if a Promise returned by previous submission is
   * not settled yet.
   *
   * Dropping a submission also prevents rerunning validation and `onBefore` hook.
   *
   * @property preventConcurrency
   * @type Boolean
   * @default true
   * @public
   */
  @arg
  preventConcurrency = true;

  /**
   * If true, after successful validation and upon submitting the form, all current element validations will be hidden.
   * If the form remains visible, the user would have to focus out of elements of submit the form again for the
   * validations to show up again, as if a fresh new form component had been rendered.
   *
   * @property hideValidationsOnSubmit
   * @type {Boolean}
   * @default false
   * @public
   */

  /**
   * If set to true the `readonly` property of all yielded form elements will be set, making their form controls read-only.
   *
   * @property readonly
   * @type boolean
   * @default false
   * @public
   */

  /**
   * If set to true the `disabled` property of all yielded form elements will be set, making their form controls disabled.
   *
   * @property disabled
   * @type boolean
   * @default false
   * @public
   */

  /**
   * Validate hook which will return a promise that will either resolve if the model is valid
   * or reject if it's not. This should be overridden to add validation support.
   *
   * @method validate
   * @param {Object} model
   * @param {HTMLFormElement} form
   * @return {Promise}
   * @public
   */
  validate(model, form) {} // eslint-disable-line no-unused-vars

  /**
   * @property _showAllValidations
   * @type boolean
   * @default undefined
   * @private
   */
  @tracked
  _showAllValidations = undefined;

  get showAllValidations() {
    return this.showValidations ?? this._showAllValidations;
  }
  set showAllValidations(showAllValidations) {
    this._showAllValidations = showAllValidations;
  }

  /**
   * Controls visibility of validation errors. If `null` (default) validation errors are shown after user
   * interactions like form submission, focus out event of input fields etc. If `true` all validation errors are shown
   * immediately independently of user interactions. If `false` validation errors are not shown in any case (but
   * prevent form submission if form is invalid).
   *
   * @property showValidations
   * @type Boolean|null
   * @default null
   * @public
   */
  @arg
  showValidations = null;

  /**
   * Action is called before the form is validated (if possible) and submitted.
   *
   * @event onBefore
   * @param { Object } model  The form's `model`
   * @public
   */

  /**
   * Action is called when submit has been triggered and the model has passed all validations (if present).
   *
   * @event onSubmit
   * @param { Object } model  The form's `model`
   * @param { Object } result The returned result from the validate method, if validation is available
   * @public
   */

  /**
   * Action is called when validation of the model has failed.
   *
   * @event onInvalid
   * @param { Object } model  The form's `model`
   * @param { Object } error
   * @public
   */

  /**
   * Submit handler that will send the default action ("action") to the controller when submitting the form.
   *
   * If there is a supplied `model` that supports validation (`hasValidator`) the model will be validated before, and
   * only if validation is successful the default action will be sent. Otherwise, an "invalid" action will be sent, and
   * all the `showValidation` property of all child `Components.FormElement`s will be set to true, so error state and
   * messages will be shown automatically.
   *
   * @method submit
   * @private
   */
  submitHandler(e, throwValidationErrors = true) {
    if (e) {
      e.preventDefault();
    }

    if (this.preventConcurrency && this.isSubmitting) {
      return RSVP.resolve();
    }

    let model = this.model;

    this.pendingSubmissions++;

    this.args.onBefore?.(model);

    return RSVP.resolve()
      .then(() => {
        return this.hasValidator ? this.validate(model, this._element) : null;
      })
      .then(
        (record) => {
          if (this.args.hideValidationsOnSubmit === true) {
            this.showAllValidations = false;
          }

          return RSVP.resolve()
            .then(() => {
              return this.args.onSubmit?.(model, record);
            })
            .then(() => {
              if (this.isDestroyed) {
                return;
              }

              this.isSubmitted = true;
            })
            .catch((error) => {
              if (this.isDestroyed) {
                return;
              }

              this.isRejected = true;

              throw error;
            })
            .finally(() => {
              if (this.isDestroyed) {
                return;
              }

              this.pendingSubmissions--;

              // reset forced hiding of validations
              if (this.showAllValidations === false) {
                next(() => (this.showAllValidations = undefined));
              }
            });
        },
        (error) => {
          return RSVP.resolve()
            .then(() => {
              return this.args.onInvalid?.(model, error);
            })
            .finally(() => {
              if (this.isDestroyed) {
                return;
              }

              this.showAllValidations = true;
              this.isRejected = true;
              this.pendingSubmissions = this.pendingSubmissions - 1;

              if (throwValidationErrors) {
                throw error;
              }
            });
        }
      );
  }

  @action
  handleSubmit(event) {
    this.submitHandler(event, false);
  }

  @action
  handleKeyPress(event) {
    let code = event.keyCode || event.which;
    if (code === 13 && this.args.submitOnEnter) {
      this.submitHandler();
    }
  }

  constructor() {
    super(...arguments);

    let formLayout = this.formLayout;
    assert(
      `Invalid formLayout property given: ${formLayout}`,
      ['vertical', 'horizontal', 'inline'].indexOf(formLayout) >= 0
    );
  }

  @action
  elementChanged(value, model, property) {
    assert(
      "You cannot use the form element's default onChange action for form elements if not using a model or setting the value directly on a form element. You must add your own onChange action to the form element in this case!",
      isPresent(model) && isPresent(property)
    );
    if (typeof model.set === 'function') {
      model.set(property, value);
    } else {
      set(model, property, value);
    }
  }

  @action
  resetSubmissionState() {
    this.isSubmitted = false;
    this.isRejected = false;
  }

  @action
  doSubmit() {
    return this.submitHandler();
  }
}
