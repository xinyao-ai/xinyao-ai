(() => {
  'use strict';

  const VERSION = '0.1.0';
  const MODE = 'PASSIVE_SPEED_FIELD_PROBE';

  let target = null;
  let previousSnapshot = null;
  let samples = [];

  function freshState() {
    return {
      version: VERSION,
      mode: MODE,
      attached: false,
      componentName: '',
      nodeName: '',
      samples: []
    };
  }

  let state = freshState();

  function descriptors(object) {
    try {
      return Object.getOwnPropertyDescriptors(object);
    } catch {
      return {};
    }
  }

  function readPlainValue(object, key) {
    const desc = descriptors(object)[key];

    if (
      !desc ||
      !('value' in desc)
    ) {
      return undefined;
    }

    return desc.value;
  }

  function getComponentName(component) {
    if (!component) {
      return '';
    }

    const ownName =
      readPlainValue(
        component,
        '__classname__'
      );

    if (
      typeof ownName === 'string' &&
      ownName
    ) {
      return ownName;
    }

    try {
      const proto =
        Object.getPrototypeOf(
          component
        );

      const ctor =
        proto &&
        readPlainValue(
          proto,
          'constructor'
        );

      if (ctor) {
        const ctorOwn =
          descriptors(ctor);

        const classDesc =
          ctorOwn.__classname__;

        if (
          classDesc &&
          'value' in classDesc &&
          typeof classDesc.value === 'string'
        ) {
          return classDesc.value;
        }

        const nameDesc =
          ctorOwn.name;

        if (
          nameDesc &&
          'value' in nameDesc &&
          typeof nameDesc.value === 'string'
        ) {
          return nameDesc.value;
        }
      }

    } catch {}

    return '';
  }

  function getNodeName(component) {
    const node =
      readPlainValue(
        component,
        'node'
      );

    if (
      !node ||
      typeof node !== 'object'
    ) {
      return '';
    }

    const name =
      readPlainValue(
        node,
        'name'
      );

    return typeof name === 'string'
      ? name
      : '';
  }

  function isPrimitive(value) {
    return (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    );
  }

  function primitiveType(value) {
    if (value === null) {
      return 'null';
    }

    return typeof value;
  }

  function readPrimitiveFields(object) {
    if (
      !object ||
      (
        typeof object !== 'object' &&
        typeof object !== 'function'
      )
    ) {
      return [];
    }

    const result = [];

    const own =
      descriptors(object);

    for (
      const [name, descriptor] of
      Object.entries(own)
    ) {
      /*
        Getter / Setter 完全不執行
      */
      if (
        !('value' in descriptor)
      ) {
        continue;
      }

      const value =
        descriptor.value;

      if (
        !isPrimitive(value)
      ) {
        continue;
      }

      result.push({
        name,
        type: primitiveType(value),
        value
      });
    }

    result.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

    return result;
  }

  function snapshotMap(fields) {
    const map =
      new Map();

    for (const field of fields) {
      map.set(
        field.name,
        field.value
      );
    }

    return map;
  }

  function diffSnapshots(
    previous,
    currentFields
  ) {
    if (!previous) {
      return [];
    }

    const changes = [];

    for (
      const field of currentFields
    ) {
      if (
        !previous.has(
          field.name
        )
      ) {
        changes.push({
          name: field.name,
          from: undefined,
          to: field.value,
          type: field.type,
          kind: 'added'
        });

        continue;
      }

      const before =
        previous.get(
          field.name
        );

      if (
        !Object.is(
          before,
          field.value
        )
      ) {
        changes.push({
          name: field.name,
          from: before,
          to: field.value,
          type: field.type,
          kind: 'changed'
        });
      }
    }

    for (
      const [name, before] of
      previous.entries()
    ) {
      if (
        !currentFields.some(
          field =>
            field.name === name
        )
      ) {
        changes.push({
          name,
          from: before,
          to: undefined,
          type: typeof before,
          kind: 'removed'
        });
      }
    }

    return changes;
  }

  function attach(nextTarget) {
    if (
      !nextTarget ||
      (
        typeof nextTarget !== 'object' &&
        typeof nextTarget !== 'function'
      )
    ) {
      return false;
    }

    target =
      nextTarget;

    previousSnapshot =
      null;

    samples =
      [];

    state = {
      version: VERSION,
      mode: MODE,
      attached: true,

      componentName:
        getComponentName(
          target
        ),

      nodeName:
        getNodeName(
          target
        ),

      samples
    };

    return true;
  }

  function sample(
    label = ''
  ) {
    if (!target) {
      return {
        label: String(label),
        timestamp: Date.now(),
        fields: [],
        changes: []
      };
    }

    const fields =
      readPrimitiveFields(
        target
      );

    const changes =
      diffSnapshots(
        previousSnapshot,
        fields
      );

    const record = {
      label: String(label),
      timestamp: Date.now(),
      fields,
      changes
    };

    samples.push(
      record
    );

    previousSnapshot =
      snapshotMap(
        fields
      );

    return record;
  }

  function getState() {
    return {
      version:
        state.version,

      mode:
        state.mode,

      attached:
        state.attached,

      componentName:
        state.componentName,

      nodeName:
        state.nodeName,

      samples:
        samples.map(sample => ({
          label:
            sample.label,

          timestamp:
            sample.timestamp,

          fields:
            sample.fields.map(
              field => ({
                ...field
              })
            ),

          changes:
            sample.changes.map(
              change => ({
                ...change
              })
            )
        }))
    };
  }

  function reset() {
    target =
      null;

    previousSnapshot =
      null;

    samples =
      [];

    state =
      freshState();

    return getState();
  }

  function getMode() {
    return MODE;
  }

  window.XinyaoATGSpeedFieldProbe = {
    version: VERSION,
    attach,
    sample,
    getState,
    reset,
    getMode
  };

})();
