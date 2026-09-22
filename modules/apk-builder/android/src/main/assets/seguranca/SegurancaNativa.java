package com.cindrastudio.security;

public class SegurancaNativa {
    static {
        System.loadLibrary("seguranca");
    }

    public static native boolean verificarAssinatura(String hashCalculado);
}
