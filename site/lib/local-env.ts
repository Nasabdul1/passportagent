import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('.local-verifier.sqlite');
export const env = {
 DB: {
  prepare(sql:string) {
   return {
    bind(...values:(string|number)[]) {
     return {
      async all() { return {results:db.prepare(sql).all(...values)}; },
      async run() {
       const result=db.prepare(sql).run(...values);
       return {meta:{changes:Number(result.changes)}};
      }
     };
    }
   };
  }
 }
};
