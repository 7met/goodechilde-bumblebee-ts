import Resources from './Resources'
import _camelCase from 'lodash/camelCase'
import Scope from'./Scope'

/**
 * TransformerAbstract class
 *
 * @class TransformerAbstract
 * @constructor
 */
export default class TransformerAbstract {
  /*
   * Resources that can be included if requested
  */
  public availableInclude = []

  /*
   * List of resources to automatically include
  */
  public defaultInclude = []

  /**
   * This method is used to transform the data.
   * Implementation required
   */
  public transform (_data: any): void {
    throw new Error('You have to implement the method transform or specify a variant when calling the transformer!')
  }

  /**
   * Helper method to transform a collection in includes
   *
   * @param {*} data
   * @param {*} transformer
   */
  public collection (data, transformer) {
    return new Resources.Collection(data, transformer)
  }

  /**
   * Helper method to transform an object in includes
   *
   * @param {*} data
   * @param {*} transformer
   */
  public item (data, transformer) {
    return new Resources.Item(data, transformer)
  }

  /**
   * Helper method to return a null resource
   *
   * @param {*} data
   * @param {*} transformer
   */
  public null () {
    return new Resources.Null()
  }

  /**
   * Processes included resources for this transformer
   *
   * @param {*} parentScope
   * @param {*} data
   */
  public async _processIncludedResources (parentScope, data) {
    const includeData: any = {}

    // figure out which of the available includes are requested
    const resourcesToInclude = this._figureOutWhichIncludes(parentScope)

    // load related lucid models
    await this._eagerloadIncludedResource(resourcesToInclude, data)

    // for each include call the include function for the transformer
    for (const include of resourcesToInclude) {
      const resource = await this._callIncludeFunction(include, parentScope, data)

      // if the include uses a resource, run the data through the transformer chain
      if (resource instanceof Resources.ResourceAbstract) {
        includeData[include] = await this._createChildScopeFor(parentScope, resource, include).toJSON()
      } else {
        // otherwise, return the data as is
        includeData[include] = resource
      }
    }

    return includeData
  }

  /**
   * Construct and call the include function
   *
   * @param {*} include
   * @param {*} parentScope
   * @param {*} data
   */
  public async _callIncludeFunction (include, parentScope, data) {
    // convert the include name to camelCase
    include = _camelCase(include)
    const includeName = `include${include.charAt(0).toUpperCase()}${include.slice(1)}`

    if (!(this[includeName] instanceof Function)) {
      throw new Error(`A method called '${includeName}' could not be found in '${this.constructor.name}'`)
    }

    return this[includeName](data, parentScope._ctx)
  }

  /**
   * Returns an array of all includes that are requested
   *
   * @param {*} parentScope
   */
  public _figureOutWhichIncludes (parentScope) {
    const includes = this.defaultInclude

    const requestedAvailableIncludes = this.availableInclude.filter(i => parentScope._isRequested(i))

    return includes.concat(requestedAvailableIncludes)
  }

  /**
   * Create a new scope for the included resource
   *
   * @param {*} parentScope
   * @param {*} resource
   * @param {*} include
   */
  public _createChildScopeFor (parentScope, resource, include) {
    // create a new scope
    const childScope = new Scope(parentScope._manager, resource, parentScope._ctx, include)

    // get the scope for this transformer
    const scopeArray = [...parentScope.getParentScopes()]

    if (parentScope.getScopeIdentifier()) {
      scopeArray.push(parentScope.getScopeIdentifier())
    }

    // set the parent scope for the new child scope
    childScope.setParentScopes(scopeArray)

    return childScope
  }

  /**
   * Eager-load lucid models for includes
   * @param {*} resourcesToInclude
   * @param {*} data
   */
  public async _eagerloadIncludedResource (resourcesToInclude, data) {
    // if there is no loadMany function, return since it propably is not a lucid model
    if (!data.loadMany) {
      return
    }

    // figure out which resources should be loaded
    const resourcesToLoad = resourcesToInclude.filter(resource => {
      // check that a relation method exists and that the relation was not previously loaded.
      return (data[resource] instanceof Function) &&
        !data.related(resource).query() && data.$relations[resource] !== null
    })

    // if no resources should be loaded, return
    if (!resourcesToLoad.length) {
      return
    }

    // load all resources
    await data.loadMany(resourcesToLoad)
  }
}
