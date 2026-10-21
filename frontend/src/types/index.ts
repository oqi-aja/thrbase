export type Role='SUPER_ADMIN'|'ADMIN'|'OPERATOR'|'VIEWER';
export type Transaction={transaction_id:string;recipient_name_snapshot:string;item_name:string;officer_name_snapshot:string;timestamp_server:string;drive_file_id:string;notes:string;status:string};
export type User={user_id:string;email:string;display_name:string;role:Role;active:boolean};