import type { Schema, Struct } from '@strapi/strapi';

export interface RegistryMetrics extends Struct.ComponentSchema {
  collectionName: 'components_registry_metrics';
  info: {
    description: 'What the automation reports about a product. Every field is written by a pipeline, not by hand.';
    displayName: 'Metrics';
    icon: 'chartBubble';
  };
  attributes: {
    acceptancePassRate: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          max: 100;
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    apiContracts: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    contractScore: Schema.Attribute.Enumeration<['A', 'B', 'C', 'D']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'C'>;
    docsUpdatedDaysAgo: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    openIncidents: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    roadmapItemsInFlight: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'registry.metrics': RegistryMetrics;
    }
  }
}
