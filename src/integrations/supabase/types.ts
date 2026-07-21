export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      cobranzas: {
        Row: {
          cliente: string;
          created_at: string;
          factura_numero: string | null;
          fecha_emision: string;
          fecha_vencimiento: string;
          id: string;
          monto: number;
          saldo: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          cliente: string;
          created_at?: string;
          factura_numero?: string | null;
          fecha_emision: string;
          fecha_vencimiento: string;
          id?: string;
          monto?: number;
          saldo?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          cliente?: string;
          created_at?: string;
          factura_numero?: string | null;
          fecha_emision?: string;
          fecha_vencimiento?: string;
          id?: string;
          monto?: number;
          saldo?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cobranzas_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cobranzas_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      cotizaciones: {
        Row: {
          asesor_codigo: string | null;
          asesor_id: string | null;
          cliente: string;
          created_at: string;
          descripcion: string | null;
          etapa: Database["public"]["Enums"]["cotizacion_etapa"];
          fecha: string;
          id: string;
          monto: number;
          monto_facturado: number;
          monto_perdido: number;
          nro_cotizacion: string | null;
          sucursal_id: string | null;
          unidad_negocio_id: string;
        };
        Insert: {
          asesor_codigo?: string | null;
          asesor_id?: string | null;
          cliente: string;
          created_at?: string;
          descripcion?: string | null;
          etapa?: Database["public"]["Enums"]["cotizacion_etapa"];
          fecha: string;
          id?: string;
          monto?: number;
          monto_facturado?: number;
          monto_perdido?: number;
          nro_cotizacion?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id: string;
        };
        Update: {
          asesor_codigo?: string | null;
          asesor_id?: string | null;
          cliente?: string;
          created_at?: string;
          descripcion?: string | null;
          etapa?: Database["public"]["Enums"]["cotizacion_etapa"];
          fecha?: string;
          id?: string;
          monto?: number;
          monto_facturado?: number;
          monto_perdido?: number;
          nro_cotizacion?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cotizaciones_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotizaciones_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      comisiones_reglas: {
        Row: {
          activa: boolean;
          created_at: string;
          id: string;
          tasa_comision: number;
          umbral_max_pct: number | null;
          umbral_min_pct: number;
          unidad_negocio_id: string | null;
        };
        Insert: {
          activa?: boolean;
          created_at?: string;
          id?: string;
          tasa_comision: number;
          umbral_max_pct?: number | null;
          umbral_min_pct: number;
          unidad_negocio_id?: string | null;
        };
        Update: {
          activa?: boolean;
          created_at?: string;
          id?: string;
          tasa_comision?: number;
          umbral_max_pct?: number | null;
          umbral_min_pct?: number;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comisiones_reglas_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      cumplimiento_asesores: {
        Row: {
          id: string;
          anio: number;
          mes: number;
          codigo_asesor: string;
          asesor: string;
          asesor_id: string | null;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          presupuesto: number;
          venta: number;
          pct_cumplimiento: number;
          pct_participacion: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          anio: number;
          mes: number;
          codigo_asesor: string;
          asesor: string;
          asesor_id?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          presupuesto?: number;
          venta?: number;
          pct_cumplimiento?: number;
          pct_participacion?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          anio?: number;
          mes?: number;
          codigo_asesor?: string;
          asesor?: string;
          asesor_id?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          presupuesto?: number;
          venta?: number;
          pct_cumplimiento?: number;
          pct_participacion?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cumplimiento_asesores_asesor_id_fkey";
            columns: ["asesor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cumplimiento_asesores_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cumplimiento_asesores_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      facturas: {
        Row: {
          asesor: string | null;
          asesor_id: string | null;
          cliente: string;
          created_at: string;
          fecha: string;
          id: string;
          monto: number;
          numero: string | null;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          asesor?: string | null;
          asesor_id?: string | null;
          cliente: string;
          created_at?: string;
          fecha: string;
          id?: string;
          monto?: number;
          numero?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          asesor?: string | null;
          asesor_id?: string | null;
          cliente?: string;
          created_at?: string;
          fecha?: string;
          id?: string;
          monto?: number;
          numero?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "facturas_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "facturas_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      minutas: {
        Row: {
          cliente: string;
          created_at: string;
          created_by: string | null;
          descripcion: string;
          estado: Database["public"]["Enums"]["minuta_estado"];
          fecha: string;
          fecha_limite: string | null;
          id: string;
          responsable: string;
          responsable_id: string | null;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cliente: string;
          created_at?: string;
          created_by?: string | null;
          descripcion: string;
          estado?: Database["public"]["Enums"]["minuta_estado"];
          fecha?: string;
          fecha_limite?: string | null;
          id?: string;
          responsable: string;
          responsable_id?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cliente?: string;
          created_at?: string;
          created_by?: string | null;
          descripcion?: string;
          estado?: Database["public"]["Enums"]["minuta_estado"];
          fecha?: string;
          fecha_limite?: string | null;
          id?: string;
          responsable?: string;
          responsable_id?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "minutas_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "minutas_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      presupuestos: {
        Row: {
          anio: number;
          id: string;
          mes: number;
          monto: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          ventas_ccv: number;
          ventas_xibi: number;
          ventas_estrategicas: number;
        };
        Insert: {
          anio: number;
          id?: string;
          mes: number;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          ventas_ccv?: number;
          ventas_xibi?: number;
          ventas_estrategicas?: number;
        };
        Update: {
          anio?: number;
          id?: string;
          mes?: number;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          ventas_ccv?: number;
          ventas_xibi?: number;
          ventas_estrategicas?: number;
        };
        Relationships: [
          {
            foreignKeyName: "presupuestos_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "presupuestos_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_admin: boolean;
          nombre_completo: string | null;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          is_admin?: boolean;
          nombre_completo?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_admin?: boolean;
          nombre_completo?: string | null;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_unidades_negocio: {
        Row: {
          profile_id: string;
          unidad_negocio_id: string;
          created_at: string;
        };
        Insert: {
          profile_id: string;
          unidad_negocio_id: string;
          created_at?: string;
        };
        Update: {
          profile_id?: string;
          unidad_negocio_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_unidades_negocio_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_unidades_negocio_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      sucursales: {
        Row: {
          activa: boolean;
          ciudad: string | null;
          created_at: string;
          id: string;
          nombre: string;
        };
        Insert: {
          activa?: boolean;
          ciudad?: string | null;
          created_at?: string;
          id?: string;
          nombre: string;
        };
        Update: {
          activa?: boolean;
          ciudad?: string | null;
          created_at?: string;
          id?: string;
          nombre?: string;
        };
        Relationships: [];
      };
      unidades_negocio: {
        Row: {
          activa: boolean;
          created_at: string;
          descripcion: string | null;
          id: string;
          nombre: string;
        };
        Insert: {
          activa?: boolean;
          created_at?: string;
          descripcion?: string | null;
          id?: string;
          nombre: string;
        };
        Update: {
          activa?: boolean;
          created_at?: string;
          descripcion?: string | null;
          id?: string;
          nombre?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      ventas_perdidas: {
        Row: {
          asesor: string | null;
          asesor_id: string | null;
          cliente: string;
          created_at: string;
          fecha: string;
          id: string;
          monto: number;
          razon: string;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          asesor?: string | null;
          asesor_id?: string | null;
          cliente: string;
          created_at?: string;
          fecha: string;
          id?: string;
          monto?: number;
          razon: string;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          asesor?: string | null;
          asesor_id?: string | null;
          cliente?: string;
          created_at?: string;
          fecha?: string;
          id?: string;
          monto?: number;
          razon?: string;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ventas_perdidas_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ventas_perdidas_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      servicios: {
        Row: {
          asesor: string | null;
          categoria_venta: string | null;
          cliente: string;
          compania: string | null;
          created_at: string;
          fecha: string;
          id: string;
          monto: number;
          sucursal_id: string | null;
          tipo_servicio: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          asesor?: string | null;
          categoria_venta?: string | null;
          cliente: string;
          compania?: string | null;
          created_at?: string;
          fecha: string;
          id?: string;
          monto?: number;
          sucursal_id?: string | null;
          tipo_servicio?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          asesor?: string | null;
          categoria_venta?: string | null;
          cliente?: string;
          compania?: string | null;
          created_at?: string;
          fecha?: string;
          id?: string;
          monto?: number;
          sucursal_id?: string | null;
          tipo_servicio?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "servicios_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "servicios_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      equipos_inventario: {
        Row: {
          anio: number;
          created_at: string;
          disponible: number;
          id: string;
          marca: string;
          mes: number;
          sucursal_id: string | null;
          transito: number;
          unidad_negocio_id: string | null;
        };
        Insert: {
          anio: number;
          created_at?: string;
          disponible?: number;
          id?: string;
          marca: string;
          mes: number;
          sucursal_id?: string | null;
          transito?: number;
          unidad_negocio_id?: string | null;
        };
        Update: {
          anio?: number;
          created_at?: string;
          disponible?: number;
          id?: string;
          marca?: string;
          mes?: number;
          sucursal_id?: string | null;
          transito?: number;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipos_inventario_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipos_inventario_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      equipos_facturacion: {
        Row: {
          anio: number;
          created_at: string;
          facturado: number;
          id: string;
          mes: number;
          presupuesto: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          anio: number;
          created_at?: string;
          facturado?: number;
          id?: string;
          mes: number;
          presupuesto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          anio?: number;
          created_at?: string;
          facturado?: number;
          id?: string;
          mes?: number;
          presupuesto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipos_facturacion_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipos_facturacion_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      equipos_presupuesto: {
        Row: {
          anio: number;
          created_at: string;
          id: string;
          monto: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          anio: number;
          created_at?: string;
          id?: string;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          anio?: number;
          created_at?: string;
          id?: string;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipos_presupuesto_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipos_presupuesto_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      equipos_facturacion_sucursal: {
        Row: {
          anio: number;
          created_at: string;
          facturado: number;
          id: string;
          mes: number;
          sucursal: string;
          unidad_negocio_id: string | null;
        };
        Insert: {
          anio: number;
          created_at?: string;
          facturado?: number;
          id?: string;
          mes: number;
          sucursal: string;
          unidad_negocio_id?: string | null;
        };
        Update: {
          anio?: number;
          created_at?: string;
          facturado?: number;
          id?: string;
          mes?: number;
          sucursal?: string;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipos_facturacion_sucursal_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      equipos_por_marca: {
        Row: {
          anio: number;
          created_at: string;
          id: string;
          marca: string;
          mes: number;
          monto: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
        };
        Insert: {
          anio: number;
          created_at?: string;
          id?: string;
          marca: string;
          mes: number;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Update: {
          anio?: number;
          created_at?: string;
          id?: string;
          marca?: string;
          mes?: number;
          monto?: number;
          sucursal_id?: string | null;
          unidad_negocio_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipos_por_marca_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipos_por_marca_unidad_negocio_id_fkey";
            columns: ["unidad_negocio_id"];
            isOneToOne: false;
            referencedRelation: "unidades_negocio";
            referencedColumns: ["id"];
          },
        ];
      };
      cobranzas_equipos: {
        Row: {
          cliente: string;
          created_at: string;
          id: string;
          monto: number;
          saldo: number;
          sucursal_id: string | null;
        };
        Insert: {
          cliente: string;
          created_at?: string;
          id?: string;
          monto?: number;
          saldo?: number;
          sucursal_id?: string | null;
        };
        Update: {
          cliente?: string;
          created_at?: string;
          id?: string;
          monto?: number;
          saldo?: number;
          sucursal_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cobranzas_equipos_sucursal_id_fkey";
            columns: ["sucursal_id"];
            isOneToOne: false;
            referencedRelation: "sucursales";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_read_row: {
        Args: { _asesor: string; _sucursal: string; _unidad: string };
        Returns: boolean;
      };
      get_user_role: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_user_sucursal: { Args: { _user_id: string }; Returns: string };
      get_user_unidad: { Args: { _user_id: string }; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      rpc_resumen_mensual: {
        Args: { _anio: number };
        Returns: {
          anio: number;
          mes: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          meta: number;
          facturado: number;
          facturado_ccv: number;
          facturado_xibi: number;
          facturado_estrategicas: number;
        }[];
      };
      rpc_cotizado_mensual: {
        Args: { _anio: number };
        Returns: {
          anio: number;
          mes: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          cotizado: number;
          monto_perdido: number;
          n_cotizaciones: number;
        }[];
      };
      rpc_perdidas_mensual: {
        Args: { _anio: number };
        Returns: {
          anio: number;
          mes: number;
          sucursal_id: string | null;
          unidad_negocio_id: string | null;
          perdido: number;
          n_perdidas: number;
        }[];
      };
      rpc_embudo_totales: {
        Args: { _anio: number; _meses?: number[] | null; _unidades?: string[] | null };
        Returns: { cotizado: number; facturado: number; cobrado: number }[];
      };
      refresh_todas_mv: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "gerencia" | "gerente_comercial" | "coordinador" | "asesor";
      cotizacion_etapa: "desarrollo" | "propuesta_negociacion" | "venta_perdida" | "desconocido";
      minuta_estado: "pendiente" | "en_proceso" | "cumplido";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["gerencia", "gerente_comercial", "coordinador", "asesor"],
      cotizacion_etapa: ["desarrollo", "propuesta_negociacion", "venta_perdida", "desconocido"],
      minuta_estado: ["pendiente", "en_proceso", "cumplido"],
    },
  },
} as const;
