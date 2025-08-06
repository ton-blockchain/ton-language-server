# Problems

## Cell

Как представлять `Cell<Foo>`? Как просто `Foo`? А что если будет `Cell<address>?`?
Как `address | null`? Где `null` будет представлять `null`-reference?
Но тогда как представить `Cell<address?>?` когда `null` могут быть и ref и его значение?
