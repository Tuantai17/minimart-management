module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      function({ types: t }) {
        return {
          name: 'transform-import-meta-custom',
          visitor: {
            MetaProperty(path) {
              if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
                path.replaceWith(
                  t.objectExpression([
                    t.objectProperty(
                      t.identifier('env'),
                      t.objectExpression([
                        t.objectProperty(
                          t.identifier('MODE'),
                          t.stringLiteral(process.env.NODE_ENV || 'development')
                        )
                      ])
                    )
                  ])
                );
              }
            }
          }
        };
      }
    ]
  };
};
